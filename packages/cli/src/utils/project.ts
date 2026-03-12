import { ConfigManager, FileProjectStore, GitWorktreeDiscovery } from '@context-forge/core/node';
import type { ProjectData } from '@context-forge/core';
import { UserError } from './errors.js';

/**
 * Find a project by exact ID or case-insensitive name.
 * ID match takes priority over name match.
 */
export async function findByNameOrId(
  nameOrId: string,
  store: FileProjectStore,
): Promise<ProjectData | null> {
  const projects = await store.getAll();

  // Exact ID match first
  const byId = projects.find((p) => p.id === nameOrId);
  if (byId) return byId;

  // Case-insensitive name match
  const lower = nameOrId.toLowerCase();
  const byName = projects.find((p) => p.name?.toLowerCase() === lower);
  return byName ?? null;
}

/** Result of a CWD-based project match, including optional worktree context. */
export interface CwdMatch {
  project: ProjectData;
  /** Set when the match was via a worktree's worktreePath rather than projectPath. */
  worktreeId?: string;
}

/**
 * Find the project whose projectPath or worktreePath best matches the current
 * working directory. When multiple paths match (nested paths), the longest wins.
 * Projects without a projectPath are skipped; worktrees without a worktreePath
 * are also skipped.
 */
export async function findProjectByCwd(
  store: FileProjectStore,
): Promise<CwdMatch | null> {
  const projects = await store.getAll();
  const cwd = process.cwd();

  interface PathCandidate {
    project: ProjectData;
    path: string;
    worktreeId?: string;
  }

  const candidates: PathCandidate[] = [];

  for (const p of projects) {
    // Existing: project root path
    if (p.projectPath) {
      candidates.push({ project: p, path: p.projectPath });
    }
    // New: worktree paths
    for (const wt of p.worktrees ?? []) {
      if (wt.worktreePath) {
        candidates.push({ project: p, path: wt.worktreePath, worktreeId: wt.id });
      }
    }
  }

  const matches = candidates
    .filter((c) => {
      const path = c.path.endsWith('/') ? c.path.slice(0, -1) : c.path;
      return cwd === path || cwd.startsWith(path + '/');
    })
    .sort((a, b) => {
      // Longest path wins; on tie, prefer worktree match over project root
      const lenDiff = b.path.length - a.path.length;
      if (lenDiff !== 0) return lenDiff;
      if (a.worktreeId && !b.worktreeId) return -1;
      if (!a.worktreeId && b.worktreeId) return 1;
      return 0;
    });

  if (matches.length === 0) return null;
  return { project: matches[0].project, worktreeId: matches[0].worktreeId };
}

export type ResolutionSource = 'flag' | 'cwd' | 'worktree' | 'default' | 'none';

export interface ResolvedProject {
  id: string;
  source: ResolutionSource;
}

export interface ResolvedProjectWorktree {
  id: string;
  source: ResolutionSource;
  /** Set when CWD matched a worktree's worktreePath. */
  worktreeId?: string;
}

// TODO(slice-186): Consider extracting core resolution logic (path matching, worktree matching)
// to packages/core if MCP server needs CWD-like resolution. Currently CLI-only since MCP uses
// explicit IDs. See 180-slices.initiative-context-worktree.md for context.

/** Options for resolveProjectWorktree. */
export interface ResolveProjectWorktreeOptions {
  /** Explicit --project flag value (name or id). */
  project?: string;
  /** Explicit --worktree flag value (name or id) — overrides CWD-derived worktreeId. */
  worktree?: string;
}

/**
 * Resolves which project and (optionally) worktree to use via a four-step chain:
 *
 * 1. explicit --project flag → findByNameOrId
 * 2. CWD detection → findProjectByCwd (worktree-aware)
 * 3. default_project config → findByNameOrId
 * 4. Throw UserError with guidance
 *
 * When opts.worktree is provided and a project was resolved, also resolves the
 * worktreeId via findWorktreeByNameOrId.
 */
export async function resolveProjectWorktree(
  opts: ResolveProjectWorktreeOptions,
  store: FileProjectStore,
): Promise<ResolvedProjectWorktree> {
  const explicit = opts.project;

  // Step 1: explicit --project flag
  if (explicit) {
    const project = await findByNameOrId(explicit, store);
    if (!project) {
      throw new UserError(
        `Project '${explicit}' not found.\n` +
          '  Check the spelling, or run cf project list to see available projects.',
      );
    }
    const resolved: ResolvedProjectWorktree = { id: project.id, source: 'flag' };
    if (opts.worktree) {
      const wt = await findWorktreeByNameOrId(project.id, opts.worktree, store);
      if (wt) resolved.worktreeId = wt.id;
    }
    return resolved;
  }

  // Step 2: CWD detection (worktree-aware)
  const cwdMatch = await findProjectByCwd(store);
  if (cwdMatch) {
    if (cwdMatch.worktreeId) {
      return { id: cwdMatch.project.id, worktreeId: cwdMatch.worktreeId, source: 'worktree' };
    }
    return { id: cwdMatch.project.id, source: 'cwd' };
  }

  // Step 2b: CWD is a git worktree of a known project (not yet registered as a cf worktree)
  try {
    const discovery = new GitWorktreeDiscovery();
    const gitWorktrees = await discovery.listWorktrees(process.cwd());
    if (gitWorktrees.length > 0) {
      const mainWorktreePath = gitWorktrees[0].path;
      const projects = await store.getAll();
      const matchingProject = projects.find((p) => p.projectPath === mainWorktreePath);
      if (matchingProject) {
        return { id: matchingProject.id, source: 'cwd' };
      }
    }
  } catch {
    // Git unavailable or not a git repo — fall through
  }

  // Step 3: default_project config
  const cm = new ConfigManager();
  const result = await cm.get('default_project');
  const defaultRef = result.value as string;

  if (defaultRef) {
    const project = await findByNameOrId(defaultRef, store);
    if (!project) {
      throw new UserError(
        `default_project is set to '${defaultRef}' but no matching project was found.\n` +
          '  cf project list                        # see available projects\n' +
          '  cf config set default_project <name>   # update the default',
      );
    }
    console.error(
      'Warning: Resolved via default_project config. Consider using --project or running from within a registered project directory.\n' +
        '  cf init          # register current directory\n' +
        '  cf project list  # see registered projects',
    );
    return { id: project.id, source: 'default' };
  }

  // Step 4: no resolution
  throw new UserError(
    'No project specified and no registered project found at current path.\n' +
      '  cf init                    # register current directory as a project\n' +
      '  --project <name>           # specify a project explicitly\n' +
      '  cf project list            # see registered projects',
  );
}

/**
 * Resolves which project to use via a three-step chain.
 * Backwards-compatible wrapper around resolveProjectWorktree — drops worktreeId.
 */
export async function resolveProjectId(
  explicit: string | undefined,
  store: FileProjectStore,
): Promise<ResolvedProject> {
  const result = await resolveProjectWorktree({ project: explicit }, store);
  return { id: result.id, source: result.source };
}

/**
 * Find a worktree within a project by exact ID or case-insensitive name.
 * ID match takes priority over name match. Returns undefined if not found.
 */
export async function findWorktreeByNameOrId(
  projectId: string,
  nameOrId: string,
  store: FileProjectStore,
): Promise<import('@context-forge/core').WorktreeContext | undefined> {
  const project = await store.getById(projectId);
  if (!project) return undefined;

  const worktrees = project.worktrees ?? [];

  // Exact ID match first
  const byId = worktrees.find((wt) => wt.id === nameOrId);
  if (byId) return byId;

  // Case-insensitive name match
  const lower = nameOrId.toLowerCase();
  return worktrees.find((wt) => wt.name.toLowerCase() === lower);
}
