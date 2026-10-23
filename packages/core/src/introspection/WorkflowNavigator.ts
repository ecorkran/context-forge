import { join } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';
import type { ProjectData, ResolvedProject } from '../types/index.js';
import type {
  SliceStatus,
  WorkflowStatus,
  NextAction,
  SlicePlanResult,
  TaskFileResult,
  SlicePlanEntry,
  NormalizedStatus,
  DisplayStatus,
} from './types.js';
import { STATUS } from './types.js';
import { parseSlicePlan } from './parsers/slicePlanParser.js';
import { parseTaskFile } from './parsers/taskFileParser.js';
import { detectDocuments } from './parsers/documentDetector.js';
import { parseFrontmatter } from './parsers/frontmatterParser.js';
import { normalizeStatus } from './parsers/statusNormalizer.js';
import { deriveEntryStatus, findFirstNotCompleteEntry } from './statusDerivation.js';
import { resolveArtifactPath } from '../schema/resolveFileByIndex.js';
import {
  ARCHITECTURE_PHASE,
  SLICE_DESIGN_PHASE,
  TASK_BREAKDOWN_PHASE,
  IMPLEMENTATION_PHASE,
} from '../schema/projectSchema.js';
import { resolveConceptPath, resolveInitiativePlanPath } from './ArtifactIntrospector.js';
import type { ConfigManager } from '../config/ConfigManager.js';
import { isDecisionGateEnabled, readPendingDecisions } from '../schema/decisionGate.js';
import { evaluateSetupCiOffer } from './setupCiOffer.js';
import type { PendingDecision } from '../schema/pendingDecisions.js';
import {
  evaluateReviewGate,
  evaluateExemption,
  isBlockingGate,
  resolveGateConfig,
  EXEMPT_NOTE,
  RETROACTIVE_NOTE,
  EXEMPT_REASON,
  type Boundary,
  type ExemptReason,
  type GateResult,
} from './reviewGate.js';
import { isInIndexRange } from '../utils/worktree-overlay.js';

/** Architecture docs live here, relative to the project root. */
const ARCH_DIR = 'project-documents/user/architecture';

/** Initiatives at or above this index are maintenance (perpetual), not architected in order. */
const MAINTENANCE_INDEX_FLOOR = 900;

/** An initiative named in the initiative plan. */
interface InitiativeRef {
  index: number;
  name: string;
}

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
/** The review types a gate can be evaluated for — mirrors BOUNDARY_REVIEW_TYPE's value union in reviewGate.ts. */
type ReviewType = 'slice' | 'tasks' | 'code';

function isReviewType(value: string): value is ReviewType {
  return value === 'slice' || value === 'tasks' || value === 'code';
}

/** User-facing label of the decision-gate action; consumers must key on `pendingDecisions`, not this text. */
const DECISION_GATE_RECOMMENDATION = 'Blocked: design has pending PM decisions';

export class WorkflowNavigator {
  /** Maps a review gate's reviewType to the phase a stale developmentPhase should be corrected to. */
  private static readonly REVIEW_TYPE_PHASE: Record<ReviewType, string> = {
    slice: SLICE_DESIGN_PHASE,
    tasks: TASK_BREAKDOWN_PHASE,
    code: IMPLEMENTATION_PHASE,
  };

  /**
   * Derives the phase a stale developmentPhase should be corrected to from a gate's
   * reviewType. GateEvaluation.reviewType is a bare string (positionToReviewType()'s
   * return type isn't narrowed to the arch/slice/tasks/code union), so this guards at
   * the boundary rather than trusting the value — an unrecognized reviewType omits the
   * phase field rather than guessing (no silent fallback).
   */
  private static resolveReviewPhase(gateInfo: { reviewType: string } | undefined): string | undefined {
    if (!gateInfo || !isReviewType(gateInfo.reviewType)) return undefined;
    return WorkflowNavigator.REVIEW_TYPE_PHASE[gateInfo.reviewType];
  }

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

    // Parse slice plan if set. Per-entry resolution failures (TD-2a) are
    // collected here rather than thrown — #62: cf status must keep running.
    // Parsed before the active slice is derived: a retroactive entry decides that status (R3).
    const warnings: string[] = [];
    status.slicePlan = await this.parseSlicePlanSafe(project, projectPath, warnings);

    // Derive active slice status
    const activeIndex = project.fileSlice ? extractSliceIndex(project.fileSlice) : null;
    const planEntry = status.slicePlan?.entries.find((e) => e.index === activeIndex);
    status.activeSlice = await this.deriveSliceStatus(project, projectPath, planEntry);
    this.dropInactiveSlice(status, warnings);
    if (warnings.length > 0) {
      status.warnings = warnings;
    }

    // Build summary
    status.summary = this.buildSummary(status);

    return status;
  }

  /**
   * A current slice that the plan resolves to deprecated or deferred is not
   * work to continue (#117). Report no active slice, so cf status and cf next
   * route to the next real candidate, and warn so the stale `fileSlice` is not
   * a silent surprise. Uses the resolved plan entry, which already folds in
   * design frontmatter, task progress and the plan line's `[~]` marker.
   */
  private dropInactiveSlice(status: WorkflowStatus, warnings: string[]): void {
    const active = status.activeSlice;
    if (!active || active.index === null || active.status === 'no-active-slice') return;
    const entry = status.slicePlan?.entries.find((e) => e.index === active.index);
    if (entry?.status !== STATUS.Deprecated && entry?.status !== STATUS.Deferred) return;
    warnings.push(
      `Current slice ${active.index} is ${entry.status}; ignoring it. Point the project at another slice with cf set slice <index>.`,
    );
    status.activeSlice = { name: active.name, index: active.index, status: 'no-active-slice' };
  }

  /**
   * Determine the recommended next action for a project.
   * Uses a priority-ordered state machine based on getStatus().
   */
  async getNext(project: ResolvedProject): Promise<NextAction> {
    // Copy so attaching offers/warnings can never touch a result shared between calls.
    const next: NextAction = { ...(await this.computeNext(project)) };
    // The setup-ci offer rides on every result (including gate blocks) and never
    // changes the recommendation (slice 260, D6).
    if (!this.config || !project.projectPath) return next;
    const { offer, warning } = await evaluateSetupCiOffer(project.projectPath, this.config);
    if (offer) next.offers = [offer];
    if (warning) next.warnings = [...(next.warnings ?? []), warning];
    return next;
  }

  private async computeNext(project: ResolvedProject): Promise<NextAction> {
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
      const conceptExists = await this.conceptDocExists(project);

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
          const blocked = this.gateBlockAction(gate, archIndex);
          if (blocked) return blocked;
        }
      }

      // First-run guidance: enriched recommendations for sparse/fresh project states (FR-1–FR-4)
      const firstRunAction = this.detectFirstRunContext(
        project,
        archFileExists,
        initiativePlanExists,
        conceptExists,
        await this.findNextInitiative(project.projectPath),
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
      const firstResult = findFirstNotCompleteEntry(status.slicePlan.entries);
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

    // Index band mismatch: warn when the slice index falls outside the range the
    // project has declared ownership of — see resolveBandWarning() and LLD Decision 1.
    if (slice.index !== null) {
      const bandWarning = this.resolveBandWarning(project, slice.index);
      if (bandWarning) {
        warnings.push(bandWarning);
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
      if (slice.gateExempt) {
        result.rationale = `${result.rationale} (${EXEMPT_NOTE[slice.gateExempt]})`;
      }
      if (slice.retroactive) {
        result.rationale = `${result.rationale} (${RETROACTIVE_NOTE})`;
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

    // LIFECYCLE: decision-gate — the design still has PM decisions to settle (cf Phase 4 work)
    if (slice.status === 'pending-decision') {
      const decisions = slice.pendingDecisions ?? [];
      const sliceLabel = slice.index ?? slice.name;
      const count = decisions.length;
      const listed = decisions.map((d) => `${d.heading} (line ${d.line})`).join('; ');
      return enrich({
        recommendation: DECISION_GATE_RECOMMENDATION,
        rationale: `Slice ${sliceLabel} design has ${count} decision${count !== 1 ? 's' : ''} pending PM confirmation: ${listed}. Resolve each with the PM and set its status line to decided before task breakdown.`,
        slice: project.fileSlice,
        phase: 'Phase 4: Slice Design',
        summary: `Blocked — slice ${sliceLabel} has ${count} pending PM decision${count !== 1 ? 's' : ''}`,
        pendingDecisions: decisions,
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
      const reviewPhase = WorkflowNavigator.resolveReviewPhase(slice.gateInfo);
      return enrich({
        recommendation: 'Review required before advancing',
        rationale: slice.gateInfo?.rationale ?? `Slice ${slice.index ?? slice.name} requires a review before proceeding.`,
        slice: project.fileSlice,
        ...(reviewPhase ? { phase: reviewPhase } : {}),
        summary: `Review required for slice ${slice.index ?? slice.name}`,
      });
    }
    if (slice.status === 'review-failed') {
      const reviewPhase = WorkflowNavigator.resolveReviewPhase(slice.gateInfo);
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
      const nextResult = findFirstNotCompleteEntry(status.slicePlan.entries);
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
   * Resolve the index-band warning for the active slice, tiered by worktree
   * configuration (LLD Decision 1):
   *   1. Active worktree known → warn unless index is in its indexRange,
   *      suppressed entirely when that worktree has rangeOverride.
   *   2. Worktrees configured but none active → warn unless index is inside
   *      any configured worktree's indexRange.
   *   3. Fewer than two worktrees configured → legacy hundredBlock(index) vs
   *      hundredBlock(archIndex) comparison. A lone worktree does not
   *      range-filter (see getWorktreeIndexRange), so it must not warn either.
   * Returns null when no warning applies. At most one warning is ever produced.
   */
  private resolveBandWarning(project: ResolvedProject, sliceIndex: number): string | null {
    const worktrees = project.worktrees ?? [];

    if (worktrees.length > 1) {
      const resolvedId = project.resolvedWorktree?.id;
      const active = resolvedId ? worktrees.find((w) => w.id === resolvedId) : undefined;

      if (active) {
        if (active.rangeOverride) return null;
        if (isInIndexRange(sliceIndex, active.indexRange)) return null;
        return `Slice ${sliceIndex} is outside worktree '${active.name}' range [${active.indexRange[0]}-${active.indexRange[1]}].`;
      }

      if (worktrees.some((w) => isInIndexRange(sliceIndex, w.indexRange))) return null;
      const ranges = worktrees
        .map((w) => `${w.name} [${w.indexRange[0]}-${w.indexRange[1]}]`)
        .join(', ');
      return `Slice ${sliceIndex} is outside all configured worktree ranges (${ranges}).`;
    }

    const archIndex = extractSliceIndex(project.fileArch);
    if (archIndex !== null && hundredBlock(sliceIndex) !== hundredBlock(archIndex)) {
      return `Slice ${sliceIndex} is outside the ${hundredBlock(archIndex)}-band of architecture '${project.fileArch}'.`;
    }
    return null;
  }

  /**
   * Returns true if the project has a concept doc file set AND that file exists on disk.
   * fileConcept is stored as a relative path directly (not a bare stem), so we resolve
   * via resolveArtifactPath first; if the field isn't mapped, fall back to treating the
   * value as a direct relative path within the project.
   */
  private async conceptDocExists(project: ProjectData): Promise<boolean> {
    if (!project.projectPath) return false;
    if (project.fileConcept) {
      const resolved = resolveArtifactPath('fileConcept', project.fileConcept);
      const relPath = resolved ?? project.fileConcept;
      if (existsSync(join(project.projectPath, relPath))) return true;
    }
    // fileConcept is never set automatically, so a concept written to the conventional
    // location must count even when unregistered (mirrors the initiative plan check).
    return (await resolveConceptPath(project.projectPath)) !== null;
  }

  /**
   * First unchecked initiative in the initiative plan that has no architecture
   * file yet. Maintenance initiatives (perpetual, never "architected") are skipped.
   * Returns null when there is no plan or nothing left to architect.
   */
  private async findNextInitiative(projectPath: string): Promise<InitiativeRef | null> {
    const planPath = await resolveInitiativePlanPath(projectPath);
    if (!planPath) return null;
    const plan = await parseSlicePlan(planPath);
    const archDir = join(projectPath, ARCH_DIR);
    const archFiles = existsSync(archDir) ? readdirSync(archDir) : [];
    const entry = plan.entries.find(
      (e) =>
        !e.isChecked &&
        e.indexSource === 'explicit' &&
        e.index < MAINTENANCE_INDEX_FLOOR &&
        !archFiles.some((f) => f.startsWith(`${e.index}-arch.`)),
    );
    return entry ? { index: entry.index, name: entry.name } : null;
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
    conceptExists: boolean,
    nextInitiative: InitiativeRef | null,
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
      !conceptExists
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
    if (phase.startsWith('Phase 0') && conceptExists) {
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
      // Arch already selected (cf set arch) but not written: name it, and use
      // plain `cf build` like the other phases — the phase selects the prompt.
      if (project.fileArch) {
        return {
          recommendation: `Your project is in Phase 2 (Architecture). Create the architecture document for ${project.fileArch}.`,
          rationale:
            'The initiative is selected but its architecture document does not exist yet. Use an architecture prompt to define its high-level structure.',
          suggestedCommand: 'cf build',
          summary: `Start Phase 2 — create the architecture document for ${project.fileArch} with cf build`,
        };
      }
      // Initiative plan lists work still to architect: suggest selecting the first.
      if (nextInitiative) {
        return {
          recommendation: `Your project is in Phase 2 (Architecture). Select the next initiative: ${nextInitiative.index} ${nextInitiative.name}.`,
          rationale:
            'The initiative plan lists initiatives in order. Select the first one without an architecture document, then create its architecture.',
          suggestedCommand: `cf set arch ${nextInitiative.index}`,
          summary: `Start Phase 2 — select initiative ${nextInitiative.index} (${nextInitiative.name})`,
        };
      }
      return {
        recommendation: 'Your project is in Phase 2 (Architecture). Create an architecture document.',
        rationale:
          'Use an architecture prompt to define the high-level structure. For small projects, you can skip architecture and go straight to a slice plan.',
        suggestedCommand: 'cf build',
        summary: 'Start Phase 2 — generate an architecture prompt with cf build',
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
    planEntry: Pick<SlicePlanEntry, 'retroactive' | 'isChecked'> | undefined,
  ): Promise<SliceStatus> {
    if (!project.fileSlice) {
      return { name: '', index: null, status: 'no-active-slice' };
    }

    const index = extractSliceIndex(project.fileSlice);
    const name = extractSliceName(project.fileSlice);
    let base: SliceStatus = { name, index, status: 'no-active-slice' };

    if (index === null) {
      return base;
    }

    // Retroactive (R3): recorded history has no design or task file, so it would read
    // needs-design. It is complete whether or not gating is on; no gate is evaluated.
    // Only a checked entry: the marker says nothing about completion (D2), so an unchecked
    // one falls through to the normal derivation, which agrees with cf list slices.
    if (planEntry?.retroactive && planEntry.isChecked) {
      return { ...base, status: STATUS.Complete, retroactive: true };
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

    // review: none applies identically at every slice boundary, so one check
    // covers every stage below, including those that evaluate no gate.
    const gateExempt = await this.reviewNoneExemption(projectPath, docs.sliceDesign);
    if (gateExempt) base = { ...base, gateExempt };

    // Parsed up front so the decision gate can tell finished work from unfinished work.
    const taskPaths = docs.taskFile?.map((p) => join(projectPath, p));
    const taskResult = taskPaths ? await this.parseTaskFileSafe(taskPaths) : null;

    // Decision gate (D4): precedes every review gate; skipped once all tasks are done.
    if (taskResult?.inferredStatus !== STATUS.Complete) {
      const pendingDecisions = await this.pendingDecisionsFor(projectPath, docs.sliceDesign);
      if (pendingDecisions.length > 0) {
        return { ...base, status: 'pending-decision', pendingDecisions };
      }
    }

    // Design exists but no task file → needs-tasks (pre-tasks / 'slice' gate)
    if (!docs.taskFile) {
      const gate = await this.evaluateGate(projectPath, index, 'preTasks');
      if (isBlockingGate(gate)) {
        return {
          ...base,
          status: gate.status,
          gateInfo: { reviewType: gate.reviewType, rationale: gate.rationale },
        };
      }
      return { ...base, status: 'needs-tasks' };
    }

    // Task file exists — taskResult (parsed above) gives progress
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
      if (isBlockingGate(gate)) {
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
      if (isBlockingGate(gate)) {
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
   * The design's pending PM decisions. Empty when the gate is off (no config, or
   * workflow.decision_gate_enabled false). Read errors propagate: an unreadable design
   * must not look like a clean one.
   */
  private async pendingDecisionsFor(projectPath: string, sliceDesign: string): Promise<PendingDecision[]> {
    if (!this.config || !(await isDecisionGateEnabled(this.config))) return [];
    return readPendingDecisions(join(projectPath, sliceDesign));
  }

  /**
   * The slice's review-none exemption when gating is on, else undefined. Grandfathered
   * slices are not surfaced (evaluateExemption checks the cutoff first).
   */
  private async reviewNoneExemption(projectPath: string, sliceDesign: string): Promise<ExemptReason | undefined> {
    if (!this.config) return undefined;
    const gate = await resolveGateConfig(this.config);
    if (gate === null) return undefined;
    const frontmatter = await parseFrontmatter(join(projectPath, sliceDesign));
    const exemption = evaluateExemption('preImplementation', gate, frontmatter.data);
    return exemption?.reason === EXEMPT_REASON.ReviewNone ? exemption.reason : undefined;
  }

  /**
   * Evaluates the review gate for a boundary. Returns null when gating is off (no config,
   * or review_enabled false) — caller keeps its existing status, byte-identical to pre-241
   * behavior. Otherwise returns the GateResult; only isBlockingGate() results
   * (pending-review / review-failed) change the caller's status.
   */
  private async evaluateGate(
    projectPath: string,
    index: number,
    boundary: Boundary,
  ): Promise<GateResult | null> {
    if (!this.config) return null;
    return evaluateReviewGate(projectPath, index, boundary, this.config);
  }

  /**
   * The action for a blocking preSlicePlan gate on architecture `archIndex`, or null when the
   * gate does not block. Shared by the project's arch gate and the adoption arch gate (264 D4).
   */
  private gateBlockAction(gate: GateResult | null, archIndex: number): NextAction | null {
    if (!isBlockingGate(gate)) return null;
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
    entry: Pick<SlicePlanEntry, 'index' | 'isChecked' | 'status'>,
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
      planLineStatus: entry.status === STATUS.Deprecated ? STATUS.Deprecated : undefined,
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
    entry: Pick<SlicePlanEntry, 'index' | 'isChecked' | 'status'>,
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
