import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync, type StdioOptions } from 'node:child_process';
import { GuideAlreadyInstalledError, type FileProjectStore } from '@context-forge/core/node';
import { buildProjectCreationDefaults } from '@context-forge/core';
import type { CreateProjectData, ProjectData } from '@context-forge/core';
import { success, warn, dim } from '../output/styles.js';
import { STDERR_SINK, STDOUT_SINK, type LogSink } from '../output/logSink.js';
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

/** The six setup steps, in the order they run. The one place the names are written. */
export const INIT_STEP = {
  git: 'git',
  register: 'register',
  gitignore: 'gitignore',
  guides: 'guides',
  commands: 'commands',
  ide: 'ide',
} as const;
export type InitStepName = (typeof INIT_STEP)[keyof typeof INIT_STEP];

export const STEP_STATUS = { ok: 'ok', skipped: 'skipped', failed: 'failed' } as const;
export type StepStatus = (typeof STEP_STATUS)[keyof typeof STEP_STATUS];

export interface StepResult {
  step: InitStepName;
  status: StepStatus;
  message?: string;
}

/** Why a step was skipped, when the skip is not an "already done" case. */
export const SKIP_REASON = {
  lite: '--lite',
  noIde: '--no-ide',
  noCommandDelivery: 'the IDE target has no command delivery',
  insideGitWorkTree: 'already inside a git work tree',
} as const;

function stepResult(step: InitStepName, status: StepStatus, message?: string): StepResult {
  return message === undefined ? { step, status } : { step, status, message };
}

/** The result for a step that a flag turned off. */
export function skippedStep(step: InitStepName, reason: string): StepResult {
  return stepResult(step, STEP_STATUS.skipped, reason);
}

/** Where progress goes: stdout for people, stderr when stdout carries the JSON report (D8). */
export interface InitOutput {
  log: LogSink;
  /** stdio for `git init`, which prints on its own. */
  gitStdio: StdioOptions;
}

const STDERR_FD = 2;
const IGNORE_STDIN = 'ignore';

export const HUMAN_OUTPUT: InitOutput = { log: STDOUT_SINK, gitStdio: 'inherit' };
export const JSON_OUTPUT: InitOutput = { log: STDERR_SINK, gitStdio: [IGNORE_STDIN, STDERR_FD, STDERR_FD] };

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Detection 1: not inside any git work tree → git init. A subfolder of an existing repository must not get a nested repo (#133). */
export function runGitStep(cwd: string, out: InitOutput): StepResult {
  if (fs.existsSync(path.join(cwd, '.git')) || isInsideGitWorkTree(cwd)) {
    return skippedStep(INIT_STEP.git, SKIP_REASON.insideGitWorkTree);
  }
  try {
    execFileSync('git', ['init'], { cwd, stdio: out.gitStdio });
    out.log(success('git initialized'));
    return stepResult(INIT_STEP.git, STEP_STATUS.ok);
  } catch (err) {
    out.log(warn('git init failed, continuing without git'));
    return stepResult(INIT_STEP.git, STEP_STATUS.failed, messageOf(err));
  }
}

/** Printed (and, with --json, sent in the error envelope) when cwd is a git worktree of a registered project. */
export const WORKTREE_REFUSAL = 'This looks like a worktree. Run cf worktree init instead.';

export type RegisterOutcome =
  | { kind: 'worktree' }
  | { kind: 'registered'; registration: 'created' | 'existing'; project: ProjectData; result: StepResult };

/**
 * Detection 2: a CF project already registered at cwd is kept and setup continues. Detection 3: a git
 * worktree of a registered project is refused. Otherwise the project is created. A store failure
 * throws: no project id exists, so there is no step result to report.
 */
export async function runRegisterStep(
  store: FileProjectStore,
  all: ProjectData[],
  cwd: string,
  name: string | undefined,
  out: InitOutput,
): Promise<RegisterOutcome> {
  const result = stepResult(INIT_STEP.register, STEP_STATUS.ok);
  const existing = all.find((p) => p.projectPath === cwd);
  if (existing) {
    out.log(dim(`Project '${existing.name}' already registered — running setup steps`));
    return { kind: 'registered', registration: 'existing', project: existing, result };
  }
  const registeredPaths = all.filter((p) => p.projectPath).map((p) => p.projectPath as string);
  if (isGitWorktreeOf(cwd, registeredPaths)) {
    out.log(warn(WORKTREE_REFUSAL));
    return { kind: 'worktree' };
  }
  const projectName = name || path.basename(cwd);
  const project = await store.create(buildProjectCreationDefaults({
    name: projectName,
    projectPath: cwd,
  }) as CreateProjectData);
  out.log(success(`Project '${projectName}' registered`));
  return { kind: 'registered', registration: 'created', project, result };
}

/** Repo hygiene, so this runs regardless of --lite. A write failure throws, as every cf init file write does. */
export function runGitignoreStep(cwd: string): StepResult {
  ensurePersonalConfigGitignored(cwd);
  return stepResult(INIT_STEP.gitignore, STEP_STATUS.ok);
}

/** Install guides. */
export async function runGuidesStep(cwd: string, strategy: string | undefined, out: InitOutput): Promise<StepResult> {
  try {
    await guidesInstallAction(cwd, { strategy }, out.log);
    out.log(success('Guides installed'));
    return stepResult(INIT_STEP.guides, STEP_STATUS.ok);
  } catch (err) {
    if (err instanceof GuideAlreadyInstalledError) {
      out.log(dim('  Guides already installed — skipping'));
      return stepResult(INIT_STEP.guides, STEP_STATUS.skipped, err.message);
    }
    out.log(warn(`Guides install failed: ${messageOf(err)}`));
    return stepResult(INIT_STEP.guides, STEP_STATUS.failed, messageOf(err));
  }
}

/** `--ide` as commander gives it: a target string, or false for `--no-ide`. */
export type IdeOption = string | boolean | undefined;

function ideTargetOf(ide: IdeOption): string {
  return typeof ide === 'string' ? ide : 'claude';
}

/**
 * Install commands/skills for the chosen IDE target, machine-level
 * (preserves the pre-slice-924 behavior of a global Claude install; a
 * project-local install is available via `cf install-commands` directly).
 * --no-ide skips delivery entirely; targets without command delivery
 * (copilot, cursor) and invalid targets skip here — the IDE step
 * reports invalid targets with the full message.
 */
export function runCommandsStep(ide: IdeOption, out: InitOutput): StepResult {
  if (ide === false) return skippedStep(INIT_STEP.commands, SKIP_REASON.noIde);
  const normalizedIde = normalizeTarget(ideTargetOf(ide));
  if (normalizedIde !== 'claude' && normalizedIde !== 'agents') {
    return skippedStep(INIT_STEP.commands, SKIP_REASON.noCommandDelivery);
  }
  try {
    installCommandsAction(normalizedIde, {}, out.log);
    return stepResult(INIT_STEP.commands, STEP_STATUS.ok);
  } catch (err) {
    out.log(warn(`Command install failed: ${messageOf(err)}`));
    return stepResult(INIT_STEP.commands, STEP_STATUS.failed, messageOf(err));
  }
}

/** IDE setup (--no-ide sets the option to false via commander negation). */
export async function runIdeStep(cwd: string, ide: IdeOption, out: InitOutput): Promise<StepResult> {
  if (ide === false) return skippedStep(INIT_STEP.ide, SKIP_REASON.noIde);
  const ideTarget = ideTargetOf(ide);
  try {
    await setupIdeAction(cwd, ideTarget, { yes: true }, out.log);
    // normalizeTarget cannot return null here: setupIdeAction just validated
    // this same string and would have thrown otherwise.
    const normalizedIdeTarget = normalizeTarget(ideTarget) ?? ideTarget;
    const wasAlias = ideTarget.trim().toLowerCase() !== normalizedIdeTarget;
    const ideLabel = wasAlias ? `${normalizedIdeTarget} (${ideTarget})` : normalizedIdeTarget;
    out.log(success(`IDE configured for ${ideLabel}`));
    return stepResult(INIT_STEP.ide, STEP_STATUS.ok);
  } catch (err) {
    out.log(warn(`IDE setup failed: ${messageOf(err)}`));
    return stepResult(INIT_STEP.ide, STEP_STATUS.failed, messageOf(err));
  }
}

export interface SetupOptions {
  lite?: boolean;
  ide?: IdeOption;
  strategy?: string;
}

/** The guides, commands and IDE steps, in order. `--lite` skips all three. */
export async function runSetupSteps(cwd: string, opts: SetupOptions, out: InitOutput): Promise<StepResult[]> {
  if (opts.lite) {
    return [INIT_STEP.guides, INIT_STEP.commands, INIT_STEP.ide].map((step) => skippedStep(step, SKIP_REASON.lite));
  }
  const guides = await runGuidesStep(cwd, opts.strategy, out);
  const commands = runCommandsStep(opts.ide, out);
  const ide = await runIdeStep(cwd, opts.ide, out);
  return [guides, commands, ide];
}

export function anyStepFailed(steps: readonly StepResult[]): boolean {
  return steps.some((step) => step.status === STEP_STATUS.failed);
}
