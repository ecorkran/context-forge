/**
 * Shared IDE-target vocabulary. Both setup-ide (IDE file generation) and
 * commandInstaller (command/skill delivery) resolve user input through this
 * single alias table so a target string means the same thing everywhere.
 * Lives in its own module to keep setup-ide ⇄ commandInstaller acyclic.
 */

export type Target = 'claude' | 'copilot' | 'cursor' | 'agents';

/** Canonical target names — the single source for validation and help text. */
export const TARGET_NAMES: readonly Target[] = ['claude', 'copilot', 'cursor', 'agents'];

/** Aliases resolved to a canonical target before anything downstream sees the input. */
export const TARGET_ALIASES: Record<string, Target> = { openai: 'agents', codex: 'agents' };

/** Target `cf init` retries once, automatically, when the requested target's IDE setup fails. */
export const IDE_SETUP_FALLBACK_TARGET: Target = 'copilot';

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
