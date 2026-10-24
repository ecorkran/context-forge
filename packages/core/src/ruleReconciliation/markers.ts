/**
 * Managed-block marker literals and the backup suffix. They are a contract with
 * files in users' projects, so each is defined exactly once, here. The cli
 * modules (`commands/ideTargets.ts`, `ideInstall/paths.ts`) re-export them.
 */

/**
 * Current managed marker, opening a BEGIN/END pair. Matched as a substring:
 * the line may be indented or carry trailing content.
 */
export const MANAGED_BEGIN_MARKER = '<!-- BEGIN:context-forge -->';

/** Closes the BEGIN/END pair. The installer matches both as whole lines. */
export const MANAGED_END_MARKER = '<!-- END:context-forge -->';

/**
 * Tags a file generated wholesale from one source: `.github/instructions/*.instructions.md`
 * now, and legacy `.github/prompts/*.prompt.md`, which the copilot install removes.
 */
export const GENERATED_MARKER = '<!-- context-forge:generated -->';

/** Suffix of the one-time backup taken before first touching an unmanaged file. */
export const PREMANAGED_BACKUP_SUFFIX = '.pre-context-forge';
