import { join } from 'node:path';
import { existsSync } from 'node:fs';
import type { ProjectData } from '../types/project.js';
import type {
  SliceStatus,
  WorkflowStatus,
  NextAction,
  SlicePlanResult,
  TaskFileResult,
  SlicePlanEntry,
  ResolvedSlicePlanEntry,
  NormalizedStatus,
  DisplayStatus,
} from './types.js';
import { STATUS } from './types.js';
import { parseSlicePlan } from './parsers/slicePlanParser.js';
import { parseTaskFile } from './parsers/taskFileParser.js';
import { detectDocuments } from './parsers/documentDetector.js';
import { parseFrontmatter } from './parsers/frontmatterParser.js';
import { normalizeStatus } from './parsers/statusNormalizer.js';
import { deriveEntryStatus } from './statusDerivation.js';
import { resolveArtifactPath } from '../schema/resolveFileByIndex.js';
import {
  ARCHITECTURE_PHASE,
  SLICE_DESIGN_PHASE,
  TASK_BREAKDOWN_PHASE,
  IMPLEMENTATION_PHASE,
} from '../schema/projectSchema.js';
import { resolveInitiativePlanPath } from './ArtifactIntrospector.js';
import type { ConfigManager } from '../config/ConfigManager.js';
import { evaluateReviewGate, type Boundary, type GateEvaluation } from './reviewGate.js';

/**
 * Extract numeric slice index from a fileSlice value like "165-slice.workflow-navigator.md".
 * Returns null if no leading number found.
 */
export function extractSliceIndex(fileSlice: string | undefined): number | null {
  if (!fileSlice) return null;
  const match = /^(\d+)-/.exec(fileSlice);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Extract the hundred-block for an index (e.g., 904 → 900, 125 → 100).
 */
function hundredBlock(index: number): number {
  return Math.floor(index / 100) * 100;
}

/**
 * Extract a human-readable slice name from a fileSlice value.
 * "165-slice.workflow-navigator.md" → "workflow-navigator"
 */
function extractSliceName(fileSlice: string): string {
  const withoutExt = fileSlice.replace(/\.md$/, '');
  const match = /^\d+-slice\.(.+)$/.exec(withoutExt);
  return match ? match[1] : withoutExt;
}

/**
 * Stateless workflow navigator that derives project status and next actions
 * from project data and filesystem state.
 */
export class WorkflowNavigator {
  /** Maps a review gate's reviewType to the phase a stale developmentPhase should be corrected to. */
  private static readonly REVIEW_TYPE_PHASE: Record<string, string> = {
    slice: SLICE_DESIGN_PHASE,
    tasks: TASK_BREAKDOWN_PHASE,
    code: IMPLEMENTATION_PHASE,
  };

  constructor(private readonly config?: ConfigManager) {}

  /**
   * Derive the full workflow status for a project.
   */
  async getStatus(project: ProjectData): Promise<WorkflowStatus> {
    const status: WorkflowStatus = {
      project: project.name,
      phase: project.developmentPhase ?? null,
      activeSlice: null,
      slicePlan: null,
      summary: '',
    };

    const projectPath = project.projectPath;
    if (!projectPath) {
      status.summary = `${project.name} — no project path configured`;
      return status;
    }

    // Derive active slice status
    status.activeSlice = await this.deriveSliceStatus(project, projectPath);

    // Parse slice plan if set. Per-entry resolution failures (TD-2a) are
    // collected here rather than thrown — #62: cf status must keep running.
    const warnings: string[] = [];
    status.slicePlan = await this.parseSlicePlanSafe(project, projectPath, warnings);
    if (warnings.length > 0) {
      status.warnings = warnings;
    }

    // Build summary
    status.summary = this.buildSummary(status);

    return status;
  }

  /**
   * Determine the recommended next action for a project.
   * Uses a priority-ordered state machine based on getStatus().
   */
  async getNext(project: ProjectData): Promise<NextAction> {
    // GUARD: no-project-path
    if (!project.projectPath) {
      return {
        recommendation: 'Set projectPath',
        rationale: 'A project path is required for workflow navigation and artifact detection.',
        suggestedCommand: 'cf set projectPath /path/to/project',
        summary: 'Set projectPath to enable workflow navigation',
      };
    }

    const status = await this.getStatus(project);
    const slice = status.activeSlice;
    // Seeded from getStatus()'s TD-2a resolution-failure warnings so cf next
    // surfaces the same non-fatal degradations cf status does (#62), rather
    // than re-deriving (and potentially double-warning) independently.
    const navWarnings: string[] = status.warnings ? [...status.warnings] : [];

    // GUARD: no-active-slice
    if (!slice || slice.status === 'no-active-slice') {
      // Determine whether the arch file actually exists on disk
      const archRelPath = project.fileArch ? resolveArtifactPath('fileArch', project.fileArch) : null;
      const archFileExists = archRelPath !== null && project.projectPath
        ? existsSync(join(project.projectPath, archRelPath))
        : false;

      // Determine whether the initiative plan file actually exists on disk.
      // This is the only signal that distinguishes a completed Phase 1 from a
      // not-started one — architecture and slice plan are Phase 2/3 outputs and
      // never exist yet at the end of Phase 1, so they cannot disambiguate it.
      const initiativePlanExists =
        (await resolveInitiativePlanPath(project.projectPath)) !== null;

      // pre-slice-plan / 'arch' gate — evaluated before first-run guidance, and regardless
      // of whether a slice plan already exists, because the arch review requirement does not
      // expire once planning moves on (#59 Gap 1). Every first-run branch downstream (FR-3b,
      // FR-4, and the fallback below) sits inside this same no-active-slice guard, so the gate
      // must intercept all of them, not just the fallback that runs after
      // detectFirstRunContext returns null.
      if (archFileExists) {
        const archIndex = extractSliceIndex(project.fileArch);
        if (archIndex !== null) {
          const gate = await this.evaluateGate(project.projectPath, archIndex, 'preSlicePlan');
          if (gate) {
            return gate.status === 'pending-review'
              ? {
                  recommendation: 'Review required before creating the slice plan',
                  rationale: gate.rationale,
                  summary: `Architecture ${archIndex} needs an ${gate.reviewType} review before the slice plan can be created`,
                }
              : {
                  recommendation: `Blocked: review verdict does not clear threshold`,
                  rationale: gate.rationale,
                  summary: `Architecture ${archIndex} review does not clear — blocked before slice plan creation`,
                };
          }
        }
      }

      // First-run guidance: enriched recommendations for sparse/fresh project states (FR-1–FR-4)
      const firstRunAction = this.detectFirstRunContext(
        project,
        archFileExists,
        initiativePlanExists,
        status,
      );
      if (firstRunAction !== null) {
        return firstRunAction;
      }

      // No architecture (or arch set but file not yet created) → recommend creating architecture first
      if (!archFileExists && !status.slicePlan) {
        return {
          recommendation: 'Create architecture document',
          rationale: project.fileArch
            ? `Architecture is set to '${project.fileArch}' but the file does not exist yet. Create the architecture document before planning slices.`
            : 'No architecture document or slice plan is configured. Architecture defines the high-level structure before slicing into deliverable increments.',
          suggestedCommand: project.fileArch
            ? `cf set phase '${ARCHITECTURE_PHASE}'`
            : 'cf set arch <index>',
          ...(project.fileArch ? { phase: ARCHITECTURE_PHASE } : {}),
          summary: 'Create an architecture document to define project structure',
        };
      }
      // Architecture exists but no slice plan
      if (!status.slicePlan) {
        if (project.fileSlicePlan) {
          const currentPhaseNoSlice = project.developmentPhase?.trim() ?? '';
          const inPhase3 = currentPhaseNoSlice.startsWith('Phase 3');
          return {
            recommendation: 'Create the slice plan document',
            rationale: inPhase3
              ? `Slice plan is set to '${project.fileSlicePlan}' but the file does not exist yet. Create the slice plan document to define deliverable increments.`
              : `Slice plan is set to '${project.fileSlicePlan}' but the file does not exist yet. Switch to Phase 3 (Slice Planning) first, then run cf build to create the slice plan.`,
            suggestedCommand: inPhase3 ? 'cf build' : "cf set phase 'Phase 3: Slice Planning'",
            phase: 'Phase 3: Slice Planning',
            summary: inPhase3 ? 'Create the slice plan document' : 'Switch to Phase 3 then create the slice plan document',
          };
        }
        return {
          recommendation: 'Create or assign a slice plan',
          rationale: 'Architecture is set but no slice plan is configured. A slice plan breaks the architecture into deliverable increments.',
          suggestedCommand: 'cf set plan <stem>',
          summary: 'Create a slice plan from the architecture',
        };
      }
      // Slice plan exists but no active slice — suggest first not-yet-complete entry
      const firstResult = this.findFirstNotCompleteEntry(status.slicePlan.entries);
      const firstEntry = firstResult?.entry;
      const sliceCmd = firstEntry ? `cf set slice ${firstEntry.index}` : 'cf set slice <index>';
      const sliceLabel = firstEntry ? `slice ${firstEntry.index}: ${firstEntry.name}` : 'your first slice';
      return {
        recommendation: 'You have a slice plan but no active slice. Pick your first slice to begin.',
        rationale: 'Choose the first unchecked slice from your plan. Then advance your phase: cf set phase 4',
        suggestedCommand: sliceCmd,
        summary: `Pick ${sliceLabel} — then cf set phase 4`,
        ...(navWarnings.length > 0 ? { warnings: navWarnings } : {}),
      };
    }

    // --- Compute warnings and arch-existence for active slice path ---
    const warnings: string[] = [...navWarnings];

    // Check if arch file exists on disk (reused below for recommendation override)
    const archRelPath = project.fileArch ? resolveArtifactPath('fileArch', project.fileArch) : null;
    const archFileExists = archRelPath !== null && project.projectPath
      ? existsSync(join(project.projectPath, archRelPath))
      : false;

    // Index band mismatch: warn when slice index is in a different hundred-block than arch/plan
    if (slice.index !== null) {
      const archIndex = extractSliceIndex(project.fileArch);
      if (archIndex !== null && hundredBlock(slice.index) !== hundredBlock(archIndex)) {
        warnings.push(
          `Slice ${slice.index} is outside the ${hundredBlock(archIndex)}-band of architecture '${project.fileArch}'.`,
        );
      }
    }

    // GUARD: arch-file-missing — arch set but file doesn't exist; recommend creating arch first
    if (project.fileArch && !archFileExists) {
      return {
        recommendation: 'Create architecture document',
        rationale: `Architecture '${project.fileArch}' is set but the file does not exist. Create the architecture document before designing slices.`,
        suggestedCommand: `cf set phase '${ARCHITECTURE_PHASE}'`,
        phase: ARCHITECTURE_PHASE,
        slice: project.fileSlice,
        summary: `Create architecture '${project.fileArch}' before proceeding with slice ${slice.index ?? slice.name}`,
        ...(warnings.length > 0 ? { warnings } : {}),
      };
    }

    // Helper to attach warnings and phase-set suggestion to any returned action
    const currentPhase = project.developmentPhase?.trim() ?? '';
    const enrich = (action: NextAction): NextAction => {
      const result = warnings.length > 0 ? { ...action, warnings } : { ...action };
      // When the recommended phase differs from the current phase, suggest setting it
      // (only if the action doesn't already have a more specific suggestedCommand)
      if (action.phase && !action.suggestedCommand && !currentPhase.startsWith(action.phase.split(':')[0])) {
        result.suggestedCommand = `cf set phase '${action.phase}'`;
      }
      return result;
    };

    // LIFECYCLE: needs-design (cf Phase 4)
    if (slice.status === 'needs-design') {
      return enrich({
        recommendation: 'Create slice design (Phase 4)',
        rationale: `Slice ${slice.index ?? slice.name} has no design document. Create a slice design before proceeding.`,
        slice: project.fileSlice,
        phase: 'Phase 4: Slice Design',
        summary: `Create design for slice ${slice.index ?? slice.name}`,
      });
    }

    // LIFECYCLE: needs-tasks (cf Phase 5)
    if (slice.status === 'needs-tasks') {
      return enrich({
        recommendation: 'Create task breakdown (Phase 5)',
        rationale: `Slice ${slice.index ?? slice.name} has a design but no task file. Break the design into actionable tasks.`,
        slice: project.fileSlice,
        phase: 'Phase 5: Task Breakdown',
        summary: `Create task breakdown for slice ${slice.index ?? slice.name}`,
      });
    }

    // LIFECYCLE: in-implementation (cf Phase 6)
    if (slice.status === 'in-implementation') {
      const remaining = slice.taskProgress
        ? slice.taskProgress.total - slice.taskProgress.completed
        : 0;
      return enrich({
        recommendation: `Continue implementation — ${remaining} task${remaining !== 1 ? 's' : ''} remaining`,
        rationale: `Slice ${slice.index ?? slice.name} is in progress with ${remaining} task${remaining !== 1 ? 's' : ''} left to complete.`,
        slice: project.fileSlice,
        phase: 'Phase 6: Implementation',
        summary: `Continue slice ${slice.index ?? slice.name} — ${remaining} tasks remaining`,
      });
    }

    // LIFECYCLE: review-gate — routes the pending-review/review-failed statuses that
    // deriveSliceStatus() already computed (TD-3: status derivation is the single source
    // of truth; this branch only routes, it does not re-evaluate the gate).
    if (slice.status === 'pending-review') {
      const reviewPhase = slice.gateInfo?.reviewType
        ? WorkflowNavigator.REVIEW_TYPE_PHASE[slice.gateInfo.reviewType]
        : undefined;
      return enrich({
        recommendation: 'Review required before advancing',
        rationale: slice.gateInfo?.rationale ?? `Slice ${slice.index ?? slice.name} requires a review before proceeding.`,
        slice: project.fileSlice,
        ...(reviewPhase ? { phase: reviewPhase } : {}),
        summary: `Review required for slice ${slice.index ?? slice.name}`,
      });
    }
    if (slice.status === 'review-failed') {
      const reviewPhase = slice.gateInfo?.reviewType
        ? WorkflowNavigator.REVIEW_TYPE_PHASE[slice.gateInfo.reviewType]
        : undefined;
      return enrich({
        recommendation: 'Blocked: review verdict does not clear threshold',
        rationale: slice.gateInfo?.rationale ?? `Slice ${slice.index ?? slice.name} is blocked by a review that does not clear.`,
        slice: project.fileSlice,
        ...(reviewPhase ? { phase: reviewPhase } : {}),
        summary: `Blocked — slice ${slice.index ?? slice.name} review does not clear`,
      });
    }

    // LIFECYCLE: complete-advance — slice complete → recommend next slice (not a phase)
    if (slice.status === 'complete' && status.slicePlan) {
      const nextResult = this.findFirstNotCompleteEntry(status.slicePlan.entries);
      const nextEntry = nextResult?.entry;
      if (nextEntry) {
        const nextDerived = nextResult.status;
        if (nextDerived === STATUS.InProgress) {
          return enrich({
            recommendation: `Continue slice ${nextEntry.index}: ${nextEntry.name}`,
            rationale: `Current slice is complete. Slice ${nextEntry.index}: ${nextEntry.name} is in progress — continue it rather than starting a new slice.`,
            suggestedCommand: `cf set slice ${nextEntry.index}`,
            slice: project.fileSlice,
            summary: `Continue slice ${nextEntry.index}: ${nextEntry.name}`,
          });
        }
        return enrich({
          recommendation: `Advance to slice ${nextEntry.index}: ${nextEntry.name}`,
          rationale: `Current slice is complete. The next unstarted slice in the plan is ${nextEntry.index}: ${nextEntry.name}.`,
          suggestedCommand: `cf set slice ${nextEntry.index}`,
          slice: project.fileSlice,
          summary: `Advance to slice ${nextEntry.index}: ${nextEntry.name}`,
        });
      }
      return enrich({
        recommendation: 'Slice plan complete. Review architecture for next initiative',
        rationale: 'All slices in the current plan are complete. Review the architecture for the next body of work.',
        slice: project.fileSlice,
        summary: 'Slice plan complete — review architecture for next initiative',
      });
    }

    // GUARD: complete-no-plan (fallback) — slice complete but no slice plan
    if (slice.status === 'complete') {
      if (project.fileSlicePlan) {
        const inPhase3 = currentPhase.startsWith('Phase 3');
        return enrich({
          recommendation: 'Create the slice plan document',
          rationale: inPhase3
            ? `Current slice is complete. Slice plan is set to '${project.fileSlicePlan}' but the file does not exist yet. Create the slice plan document.`
            : `Current slice is complete. Slice plan is set to '${project.fileSlicePlan}' but the file does not exist yet. Switch to Phase 3 (Slice Planning) first, then run cf build to create the slice plan.`,
          suggestedCommand: inPhase3 ? 'cf build' : undefined,
          phase: 'Phase 3: Slice Planning',
          slice: project.fileSlice,
          summary: inPhase3
            ? 'Slice complete — create the slice plan document'
            : 'Slice complete — switch to Phase 3 then create the slice plan document',
        });
      }
      return enrich({
        recommendation: 'Create or assign a slice plan',
        rationale: 'Current slice is complete but no slice plan is configured to determine next steps.',
        suggestedCommand: 'cf set plan <stem>',
        slice: project.fileSlice,
        summary: 'Slice complete — create or assign a slice plan',
      });
    }

    // Should not reach here, but provide a safe fallback
    return enrich({
      recommendation: 'Review project status',
      rationale: 'Unable to determine next action from current project state.',
      summary: 'Review project status',
    });
  }

/**
   * Returns true if the project has a concept doc file set AND that file exists on disk.
   * fileConcept is stored as a relative path directly (not a bare stem), so we resolve
   * via resolveArtifactPath first; if the field isn't mapped, fall back to treating the
   * value as a direct relative path within the project.
   */
  private conceptDocExists(project: ProjectData): boolean {
    if (!project.fileConcept || !project.projectPath) return false;
    const resolved = resolveArtifactPath('fileConcept', project.fileConcept);
    const relPath = resolved ?? project.fileConcept;
    return existsSync(join(project.projectPath, relPath));
  }

  /**
   * Returns enriched guidance for sparse/fresh project states (FR-1–FR-4).
   * Only called when no active slice is set AND the project lacks established artifacts.
   * Returns null if no first-run condition matches (falls through to the `no-active-slice` guard).
   */
  private detectFirstRunContext(
    project: ProjectData,
    archFileExists: boolean,
    initiativePlanExists: boolean,
    status: WorkflowStatus,
  ): NextAction | null {
    // Only applies to projects without both arch and slice plan
    if (archFileExists && status.slicePlan !== null) return null;

    const phase = project.developmentPhase?.trim() ?? '';

    // FR-1: No phase set
    if (!phase) {
      return {
        recommendation: 'Welcome to Context Forge! Start by setting your project phase.',
        rationale:
          "Your project is registered but no development phase is set. Phases guide what to do next — start with Phase 0 (Concept) to define what you're building.",
        suggestedCommand: "cf set phase 'Phase 0: Concept'",
        summary: 'Set a development phase to get started',
      };
    }

    // Phase 0, no concept doc → create concept
    if (
      phase.startsWith('Phase 0') &&
      !archFileExists &&
      status.slicePlan === null &&
      !this.conceptDocExists(project)
    ) {
      return {
        recommendation: 'Your project is in Phase 0 (Concept). Start by describing what you want to build.',
        rationale:
          'Use a concept prompt to guide a conversation with your AI agent about the project idea. This produces a concept document that drives the initiative plan and architecture phases.',
        suggestedCommand: 'cf build',
        summary: 'Start Phase 0 — generate a concept prompt with cf build',
      };
    }

    // Phase 0, concept doc exists → advance to Phase 1 (Initiative Plan)
    if (
      phase.startsWith('Phase 0') &&
      this.conceptDocExists(project)
    ) {
      return {
        recommendation: 'Concept document exists. Advance to Phase 1 (Initiative Plan).',
        rationale:
          'Your concept is complete. The next step is to decompose it into named initiatives — use cf build to generate an initiative plan prompt.',
        suggestedCommand: "cf set phase 'Phase 1: Initiative Plan'",
        summary: 'Advance to Phase 1 — create an initiative plan from your concept',
      };
    }

    // Phase 1, initiative plan not yet created → create it.
    // Gate strictly on the initiative plan file. Do NOT gate on architecture or
    // slice-plan absence: those are Phase 2/3 outputs and never exist yet at this
    // point, so including them would make this branch fire even after the plan is done.
    if (phase.startsWith('Phase 1') && !initiativePlanExists) {
      return {
        recommendation: 'Your project is in Phase 1 (Initiative Plan). Create an initiative plan from your concept.',
        rationale:
          'The initiative plan decomposes your concept into named initiatives with index assignments and dependencies. This drives all subsequent architecture work.',
        suggestedCommand: 'cf build',
        summary: 'Start Phase 1 — generate an initiative plan prompt with cf build',
      };
    }

    // Phase 1, initiative plan exists → advance to Phase 2 (Architecture).
    // Mirrors the Phase 0 → Phase 1 advancement branch above.
    if (phase.startsWith('Phase 1') && initiativePlanExists && !archFileExists) {
      return {
        recommendation: 'Initiative plan exists. Advance to Phase 2 (Architecture).',
        rationale:
          'Your initiative plan is complete. The next step is to define the high-level structure — set your phase to Phase 2 (Architecture) and create an architecture document.',
        suggestedCommand: `cf set phase '${ARCHITECTURE_PHASE}'`,
        summary: 'Advance to Phase 2 — set phase and create an architecture document',
      };
    }

    // Phase 2, no arch and no plan
    if (phase.startsWith('Phase 2') && !archFileExists && status.slicePlan === null) {
      return {
        recommendation: 'Your project is in Phase 2 (Architecture). Create an architecture document.',
        rationale:
          'Use an architecture prompt to define the high-level structure. For small projects, you can skip architecture and go straight to a slice plan.',
        suggestedCommand: 'cf build --phase architecture',
        summary: 'Start Phase 2 — generate an architecture prompt with cf build --phase architecture',
      };
    }

    // FR-3b: Phase 2, arch exists but no slice plan → advance to Phase 3
    if (phase.startsWith('Phase 2') && archFileExists && status.slicePlan === null) {
      return {
        recommendation: 'Architecture document exists. Advance to Phase 3 and create a slice plan.',
        rationale:
          'Your architecture document is complete. Set your phase to Phase 3 (Slice Planning) and create a slice plan to break the architecture into deliverable increments.',
        suggestedCommand: "cf set phase 'Phase 3: Slice Planning'",
        summary: 'Advance to Phase 3 — set phase and create a slice plan',
      };
    }

    // FR-4: Phase 3, no slice plan
    if (phase.startsWith('Phase 3') && status.slicePlan === null) {
      if (project.fileSlicePlan) {
        return {
          recommendation: 'Your project is in Phase 3 (Slice Planning). Create the slice plan document.',
          rationale:
            `Slice plan is set to '${project.fileSlicePlan}' but the file does not exist yet. Use a slice-planning prompt to create it.`,
          suggestedCommand: 'cf build',
          summary: 'Start Phase 3 — create the slice plan document with cf build',
        };
      }
      return {
        recommendation: 'Your project is in Phase 3 (Slice Planning). Create a slice plan from your architecture.',
        rationale:
          'A slice plan breaks the architecture into deliverable increments. Use a slice-planning prompt to guide the conversation. After creating the file, register it: cf set plan <stem>',
        suggestedCommand: 'cf build',
        summary: 'Start Phase 3 — generate a slice-planning prompt with cf build',
      };
    }

    return null;
  }

  /**
   * Derive the status of the currently active slice.
   */
  private async deriveSliceStatus(
    project: ProjectData,
    projectPath: string,
  ): Promise<SliceStatus> {
    if (!project.fileSlice) {
      return { name: '', index: null, status: 'no-active-slice' };
    }

    const index = extractSliceIndex(project.fileSlice);
    const name = extractSliceName(project.fileSlice);
    const base: SliceStatus = { name, index, status: 'no-active-slice' };

    if (index === null) {
      return base;
    }

    // Note: no outer try/catch swallowing here. detectDocuments and
    // evaluateReviewGate never throw for missing files, and parseTaskFileSafe
    // below only propagates a genuine resolution failure (task file present
    // but unreadable) — TD-2a requires that to surface, not silently degrade
    // this active slice's status back to a misleading `base` state.
    const docs = await detectDocuments(projectPath, index);

    // No slice design file → needs-design
    if (!docs.sliceDesign) {
      return { ...base, status: 'needs-design' };
    }

    // Design exists but no task file → needs-tasks (pre-tasks / 'slice' gate)
    if (!docs.taskFile) {
      const gate = await this.evaluateGate(projectPath, index, 'preTasks');
      if (gate) {
        return {
          ...base,
          status: gate.status,
          gateInfo: { reviewType: gate.reviewType, rationale: gate.rationale },
        };
      }
      return { ...base, status: 'needs-tasks' };
    }

    // Task file exists — parse to determine progress
    const taskPaths = docs.taskFile.map((p) => join(projectPath, p));
    const taskResult = await this.parseTaskFileSafe(taskPaths);

    if (!taskResult || taskResult.totalTasks === 0) {
      return { ...base, status: 'needs-tasks' };
    }

    const taskProgress = {
      completed: taskResult.completedTasks,
      total: taskResult.totalTasks,
      inferredStatus: taskResult.inferredStatus,
    };

    if (taskResult.inferredStatus === STATUS.Complete) {
      // pre-advance / 'code' gate — implementation done, code review owed before advancing
      const gate = await this.evaluateGate(projectPath, index, 'preAdvance');
      if (gate) {
        return {
          ...base,
          status: gate.status,
          taskProgress,
          gateInfo: { reviewType: gate.reviewType, rationale: gate.rationale },
        };
      }
      return { ...base, status: 'complete', taskProgress };
    }

    // Task file freshly created (zero progress) → pre-implementation / 'tasks' gate.
    // Fires only at the transition into implementation, not on every partial-progress call.
    if (taskResult.completedTasks === 0) {
      const gate = await this.evaluateGate(projectPath, index, 'preImplementation');
      if (gate) {
        return {
          ...base,
          status: gate.status,
          taskProgress,
          gateInfo: { reviewType: gate.reviewType, rationale: gate.rationale },
        };
      }
    }

    return { ...base, status: 'in-implementation', taskProgress };
  }

  /**
   * Evaluates the review gate for a boundary. Returns null when gating is off (no config,
   * or review_enabled false) — caller keeps its existing status, byte-identical to pre-241
   * behavior. Returns a GateEvaluation when the boundary's review is absent (pending-review)
   * or present-but-not-clearing (review-failed).
   */
  private async evaluateGate(
    projectPath: string,
    index: number,
    boundary: Boundary,
  ): Promise<GateEvaluation | null> {
    if (!this.config) return null;
    return evaluateReviewGate(projectPath, index, boundary, this.config);
  }

  /**
   * Parses a task file, returning null only when the file is genuinely
   * absent. A resolution failure (permission denied, EISDIR, etc.) is not
   * "absent" (TD-2a) and propagates rather than being coerced to null.
   */
  private async parseTaskFileSafe(taskPaths: string[]): Promise<TaskFileResult | null> {
    try {
      return await parseTaskFile(taskPaths);
    } catch (err) {
      if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Resolve a plan entry's derived status by looking up its task file and
   * slice-design frontmatter (if present), then applying deriveEntryStatus.
   *
   * TD-2a: a signal that exists but fails to resolve (task file present but
   * unreadable, frontmatter status present but unrecognized) is a resolution
   * failure, not an absent signal — it propagates rather than falling through
   * to the checkbox. A signal that is genuinely absent (no task file, no
   * slice design) is a normal `undefined` input to the lattice.
   */
  private async resolveEntryStatus(
    projectPath: string,
    entry: Pick<SlicePlanEntry, 'index' | 'isChecked'>,
  ): Promise<NormalizedStatus> {
    const docs = await detectDocuments(projectPath, entry.index);

    let taskInferredStatus: NormalizedStatus | undefined;
    if (docs.taskFile) {
      const taskPaths = docs.taskFile.map((p) => join(projectPath, p));
      const taskResult = await parseTaskFile(taskPaths);
      taskInferredStatus = taskResult.inferredStatus;
    }

    let frontmatterStatus: NormalizedStatus | undefined;
    if (docs.sliceDesign) {
      const fm = await parseFrontmatter(join(projectPath, docs.sliceDesign));
      if (fm.found) {
        const normalized = normalizeStatus(fm.data.status);
        if (normalized === undefined) {
          throw new Error(
            `Slice ${entry.index}: slice-design frontmatter status "${fm.data.status}" is not a recognized status`,
          );
        }
        frontmatterStatus = normalized;
      }
    }

    return deriveEntryStatus({
      frontmatterStatus,
      taskInferredStatus,
      isChecked: entry.isChecked,
    });
  }

  /**
   * Resolve an entry's status, degrading rather than throwing on a per-entry
   * resolution failure (TD-2a). The underlying resolution failure is still
   * surfaced — as a pushed warning — rather than silently discarded; it just
   * no longer aborts callers that must keep going across many entries (#62:
   * one slice with an unrecognized frontmatter status must not take down
   * `cf status`/`cf next` for the whole project).
   */
  private async resolveEntryStatusSafe(
    projectPath: string,
    entry: Pick<SlicePlanEntry, 'index' | 'isChecked'>,
    warnings: string[],
  ): Promise<DisplayStatus> {
    try {
      return await this.resolveEntryStatus(projectPath, entry);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(message);
      return 'degraded';
    }
  }

  /**
   * Find the first plan entry whose derived status is not complete/deprecated/deferred.
   * Replaces the old `entries.find((e) => !e.isChecked)` — the direct #56 fix:
   * a slice with all tasks complete but an unchecked plan checkbox is no
   * longer selected as "next unstarted". A degraded entry (TD-2a) counts as
   * not-complete so it surfaces rather than being silently skipped. A deferred
   * entry is a "not now" declaration, same as deprecated is a "not ever" one —
   * neither should be offered as the next slice to work on.
   *
   * Reads the already-resolved `entry.status` (computed once by getStatus's
   * parseSlicePlanSafe) rather than re-deriving via a second filesystem pass —
   * avoids redundant I/O and, for a degraded entry, avoids pushing the same
   * TD-2a warning into the caller's warnings list twice (#62).
   */
  private findFirstNotCompleteEntry(
    entries: ResolvedSlicePlanEntry[],
  ): { entry: ResolvedSlicePlanEntry; status: DisplayStatus } | undefined {
    for (const entry of entries) {
      if (
        entry.status !== STATUS.Complete &&
        entry.status !== STATUS.Deprecated &&
        entry.status !== STATUS.Deferred
      ) {
        return { entry, status: entry.status };
      }
    }
    return undefined;
  }

  private async parseSlicePlanSafe(
    project: ProjectData,
    projectPath: string,
    warnings: string[],
  ): Promise<WorkflowStatus['slicePlan']> {
    if (!project.fileSlicePlan) return null;

    let result: SlicePlanResult;
    let planName: string;
    try {
      const relativePath = resolveArtifactPath('fileSlicePlan', project.fileSlicePlan);
      if (!relativePath) return null;
      const planPath = join(projectPath, relativePath);
      result = await parseSlicePlan(planPath);
      if (result.totalSlices === 0) return null;
      planName = project.fileSlicePlan.split('/').pop() ?? project.fileSlicePlan;
    } catch {
      // Slice plan file missing/unreadable — a normal "no plan yet" case.
      return null;
    }

    // Route each entry's status through the derivation lattice so this surface
    // (and workflow_status, which returns getStatus() verbatim) agrees with
    // cf list slices/getNext instead of showing the raw, checkbox-only
    // SlicePlanEntry.status (slice 911 MCP-parity fix). A per-entry resolution
    // failure (TD-2a) is surfaced as a warning rather than silently discarded,
    // but must not abort the whole plan/command (#62) — see resolveEntryStatusSafe.
    const entries = await Promise.all(
      result.entries.map(async (entry) => ({
        ...entry,
        status: await this.resolveEntryStatusSafe(projectPath, entry, warnings),
      })),
    );

    return {
      name: planName,
      completed: result.completedSlices,
      total: result.totalSlices,
      entries,
    };
  }

  private buildSummary(status: WorkflowStatus): string {
    const parts: string[] = [status.project];

    if (status.phase) {
      parts.push(`— ${status.phase}`);
    }

    if (status.activeSlice) {
      const s = status.activeSlice;
      if (s.status === 'no-active-slice') {
        parts.push('— no active slice');
      } else {
        const sliceLabel = s.index !== null ? `slice ${s.index}` : s.name;
        parts.push(`— ${sliceLabel} ${s.status}`);
        if (s.taskProgress) {
          parts.push(`(${s.taskProgress.completed}/${s.taskProgress.total} tasks)`);
        }
      }
    }

    if (status.slicePlan) {
      parts.push(`[plan: ${status.slicePlan.completed}/${status.slicePlan.total}]`);
    }

    return parts.join(' ');
  }
}
