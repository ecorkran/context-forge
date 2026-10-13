/**
 * Shared IDE-target vocabulary. Both setup-ide (IDE file generation) and
 * commandInstaller (command/skill delivery) resolve user input through this
 * single alias table so a target string means the same thing everywhere.
 * Also holds the per-target descriptors and every marker literal. Lives in its
 * own leaf module so setup-ide, commandInstaller, and worktreePropagation stay
 * acyclic; it imports from none of them.
 */

export type Target = 'claude' | 'copilot' | 'cursor' | 'agents';

/** Canonical target names — the single source for validation and help text. */
export const TARGET_NAMES: readonly Target[] = ['claude', 'copilot', 'cursor', 'agents'];

/** Aliases resolved to a canonical target before anything downstream sees the input. */
export const TARGET_ALIASES: Record<string, Target> = { openai: 'agents', codex: 'agents' };

/** Project-relative Agent Skills directory (`<name>/SKILL.md`), shared by Codex and Copilot. */
export const AGENT_SKILLS_DIR = '.agents/skills';

/** Resolves a target string (case/whitespace-insensitive) to its canonical form, or null if unknown. */
export function normalizeTarget(input: string): Target | null {
  const normalized = input.trim().toLowerCase();
  if ((TARGET_NAMES as readonly string[]).includes(normalized)) return normalized as Target;
  if (normalized in TARGET_ALIASES) return TARGET_ALIASES[normalized];
  return null;
}

/** Groups TARGET_ALIASES by canonical target, e.g. "openai, codex → agents". */
function describeAliases(): string {
  const byTarget = new Map<Target, string[]>();
  for (const [alias, target] of Object.entries(TARGET_ALIASES)) {
    const group = byTarget.get(target) ?? [];
    group.push(alias);
    byTarget.set(target, group);
  }
  return Array.from(byTarget.entries())
    .map(([target, aliases]) => `${aliases.join(', ')} → ${target}`)
    .join(', ');
}

/** Built from TARGET_NAMES/TARGET_ALIASES so the message can never drift from what normalizeTarget accepts. */
export function invalidTargetMessage(input: string): string {
  return `Invalid target '${input}'. Valid targets: ${TARGET_NAMES.join(', ')} (aliases: ${describeAliases()})`;
}

export interface TargetDescriptor {
  /** Files probed for the managed marker before the overwrite prompt. */
  markerFiles: string[];
  /** Label used in prompts and completion messages. */
  label: string;
}

/**
 * One definition per target drives validation and the managed-marker check.
 * The `Record<Target, TargetDescriptor>` annotation makes the compiler reject a
 * target added to the `Target` union without an entry here.
 */
export const TARGETS: Record<Target, TargetDescriptor> = {
  claude: {
    markerFiles: ['CLAUDE.md'],
    label: 'Claude Code',
  },
  copilot: {
    markerFiles: ['.github/copilot-instructions.md', 'AGENTS.md'],
    label: 'GitHub Copilot',
  },
  cursor: {
    markerFiles: ['AGENTS.md'],
    label: 'Cursor',
  },
  agents: {
    markerFiles: ['AGENTS.md'],
    label: 'agents',
  },
};

/** Legacy managed marker. Matched as a trimmed exact line. */
export const MANAGED_MARKER = '[//]: # (context-forge:managed)';

/**
 * Current managed marker, opening a BEGIN/END pair. Matched as a substring:
 * the line may be indented or carry trailing content.
 */
export const MANAGED_BEGIN_MARKER = '<!-- BEGIN:context-forge -->';

/** Closes the BEGIN/END pair. The installer matches both as whole lines. */
export const MANAGED_END_MARKER = '<!-- END:context-forge -->';

/**
 * Never emitted, but projects hand-added it after the legacy marker to put
 * their own content after the generated span. Detection only: everything after
 * it survives legacy migration.
 */
export const MANAGED_MARKER_END = '[//]: # (context-forge:managed end)';

/**
 * Every form that marks a file as context-forge-managed.
 *
 * cf's installer (ideInstall/) writes the BEGIN/END pair; the legacy form is
 * only detected and migrated. Every marker literal lives in this module so it
 * appears in exactly one place: they are a contract with files in users' projects.
 */
export const MANAGED_MARKERS = [
  { marker: MANAGED_MARKER, match: 'exact-line' },
  { marker: MANAGED_BEGIN_MARKER, match: 'contains' },
] as const;

/**
 * Tags a file generated wholesale from one source: `.github/instructions/*.instructions.md`
 * now, and legacy `.github/prompts/*.prompt.md`, which the copilot install removes.
 */
export const GENERATED_MARKER = '<!-- context-forge:generated -->';
