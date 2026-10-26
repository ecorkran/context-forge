import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { FileProjectStore } from '@context-forge/core/node';
import { buildProjectCreationDefaults } from '@context-forge/core';
import type { CreateProjectData, ProjectData } from '@context-forge/core';
import { success, warn, dim } from '../output/styles.js';
import { guidesInstallAction } from './guides.js';
import { setupIdeAction, normalizeTarget } from './setup-ide.js';
import { installCommandsAction } from './commandInstaller.js';

/**
 * Returns true if the cwd is a git worktree whose main worktree is already
 * registered as a CF project.
 */
function isGitWorktreeOf(cwd: string, registeredPaths: string[]): boolean {
  try {
    const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd,
      encoding: 'utf8',
    });
    const worktreePaths: string[] = [];
    for (const line of output.split('\n')) {
      if (line.startsWith('worktree ')) {
        worktreePaths.push(line.slice('worktree '.length).trim());
      }
    }
    const mainWorktreePath = worktreePaths[0];
    if (!mainWorktreePath) return false;
    return registeredPaths.includes(mainWorktreePath) && mainWorktreePath !== cwd;
  } catch {
    return false;
  }
}

/**
 * Returns true if cwd is inside a git work tree, including a subfolder of an
 * enclosing repository.
 */
function isInsideGitWorkTree(cwd: string): boolean {
  try {
    const output = execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return String(output).trim() === 'true';
  } catch {
    // git exits non-zero outside a repository, or is not installed; both mean
    // "not in a work tree", and the git init step reports its own failure.
    return false;
  }
}

const PERSONAL_CONFIG_GITIGNORE_LINE = '.context-forge.local.toml';

/**
 * Ensures the CWD's .gitignore contains a line for the personal config file.
 * Simple line-based check (not a full gitignore-pattern parse) — matches this
 * project's lenient-parsing convention for straightforward line-oriented files.
 * A write failure propagates to the caller's handleError(err) catch block,
 * consistent with every other cf init file-write failure.
 */
export function ensurePersonalConfigGitignored(cwd: string): void {
  const gitignorePath = path.join(cwd, '.gitignore');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, `${PERSONAL_CONFIG_GITIGNORE_LINE}\n`, 'utf-8');
    return;
  }
  const content = fs.readFileSync(gitignorePath, 'utf-8');
  const alreadyPresent = content.split('\n').some((line) => line.trim() === PERSONAL_CONFIG_GITIGNORE_LINE);
  if (alreadyPresent) return;
  const needsNewline = content.length > 0 && !content.endsWith('\n');
  fs.writeFileSync(
    gitignorePath,
    content + (needsNewline ? '\n' : '') + `${PERSONAL_CONFIG_GITIGNORE_LINE}\n`,
    'utf-8'
  );
}

/** Detection 1: not inside any git work tree → git init. A subfolder of an existing repository must not get a nested repo (#133). */
export function runGitStep(cwd: string): void {
  if (!fs.existsSync(path.join(cwd, '.git')) && !isInsideGitWorkTree(cwd)) {
    try {
      execFileSync('git', ['init'], { cwd, stdio: 'inherit' });
      console.log(success('git initialized'));
    } catch {
      console.log(warn('git init failed, continuing without git'));
    }
  }
}

export type RegisterOutcome = { kind: 'worktree' } | { kind: 'registered' };

/**
 * Detection 2: a CF project already registered at cwd is kept and setup continues. Detection 3: a git
 * worktree of a registered project is refused. Otherwise the project is created.
 */
export async function runRegisterStep(
  store: FileProjectStore,
  all: ProjectData[],
  cwd: string,
  name: string | undefined,
): Promise<RegisterOutcome> {
  const existing = all.find((p) => p.projectPath === cwd);
  if (existing) {
    console.log(dim(`Project '${existing.name}' already registered — running setup steps`));
    return { kind: 'registered' };
  }
  const registeredPaths = all.filter((p) => p.projectPath).map((p) => p.projectPath as string);
  if (isGitWorktreeOf(cwd, registeredPaths)) {
    console.log(warn('This looks like a worktree. Run cf worktree init instead.'));
    return { kind: 'worktree' };
  }
  const projectName = name || path.basename(cwd);
  await store.create(buildProjectCreationDefaults({
    name: projectName,
    projectPath: cwd,
  }) as CreateProjectData);
  console.log(success(`Project '${projectName}' registered`));
  return { kind: 'registered' };
}

/** Step 2: install guides. */
export async function runGuidesStep(cwd: string, strategy: string | undefined): Promise<void> {
  try {
    await guidesInstallAction(cwd, { strategy });
    console.log(success('Guides installed'));
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.toLowerCase().includes('already installed')) {
      console.log(dim('  Guides already installed — skipping'));
    } else {
      console.log(warn(`Guides install failed: ${msg}`));
    }
  }
}

/** `--ide` as commander gives it: a target string, or false for `--no-ide`. */
export type IdeOption = string | boolean | undefined;

function ideTargetOf(ide: IdeOption): string {
  return typeof ide === 'string' ? ide : 'claude';
}

/**
 * Step 3: install commands/skills for the chosen IDE target, machine-level
 * (preserves the pre-slice-924 behavior of a global Claude install; a
 * project-local install is available via `cf install-commands` directly).
 * --no-ide skips delivery entirely; targets without command delivery
 * (copilot, cursor) and invalid targets skip silently here — the IDE step
 * reports invalid targets with the full message.
 */
export function runCommandsStep(ide: IdeOption): void {
  if (ide === false) return;
  const normalizedIde = normalizeTarget(ideTargetOf(ide));
  if (normalizedIde === 'claude' || normalizedIde === 'agents') {
    try {
      installCommandsAction(normalizedIde);
    } catch (err) {
      console.log(warn(`Command install failed: ${(err as Error).message}`));
    }
  }
}

/** Step 4: IDE setup (--no-ide sets the option to false via commander negation). */
export async function runIdeStep(cwd: string, ide: IdeOption): Promise<void> {
  if (ide === false) return;
  const ideTarget = ideTargetOf(ide);
  try {
    await setupIdeAction(cwd, ideTarget, { yes: true });
    // normalizeTarget cannot return null here: setupIdeAction just validated
    // this same string and would have thrown otherwise.
    const normalizedIdeTarget = normalizeTarget(ideTarget) ?? ideTarget;
    const wasAlias = ideTarget.trim().toLowerCase() !== normalizedIdeTarget;
    const ideLabel = wasAlias ? `${normalizedIdeTarget} (${ideTarget})` : normalizedIdeTarget;
    console.log(success(`IDE configured for ${ideLabel}`));
  } catch (err) {
    console.log(warn(`IDE setup failed: ${(err as Error).message}`));
  }
}
