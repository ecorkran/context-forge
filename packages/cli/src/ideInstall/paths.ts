/**
 * Guide source layout and install-side paths, defined once for every module in
 * ideInstall/. The guide layout has been stable since v0.19.
 */
import * as path from 'node:path';

/** Directory under a guide checkout that holds every install source. */
const GUIDE_SOURCES_DIR = 'project-guides';

export interface GuidePaths {
  rules: string;
  agents: string;
  skills: string;
  lint: string;
}

/** Source directories of the guide checked out at `guideDir`. */
export function guidePaths(guideDir: string): GuidePaths {
  const sources = path.join(path.resolve(guideDir), GUIDE_SOURCES_DIR);
  return {
    rules: path.join(sources, 'rules'),
    agents: path.join(sources, 'agents'),
    skills: path.join(sources, 'skills'),
    lint: path.join(sources, 'lint'),
  };
}

/** Suffix of the one-time backup taken before first touching an unmanaged file. */
export const PREMANAGED_BACKUP_SUFFIX = '.pre-context-forge';

/** Claude Code keeps git worktrees here: whole checkouts, never install output. */
export const DRY_RUN_SKIP_PATH = '.claude/worktrees';

/**
 * `<root>/<rel>` → `<rel>`; anything not under root is returned unchanged.
 * The bash `${path#"$ROOT"/}` expansion, used for every displayed path.
 */
export function relativeToRoot(root: string, file: string): string {
  const prefix = root + '/';
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
}
