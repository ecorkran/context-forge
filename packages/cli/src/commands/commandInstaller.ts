import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { success, dim } from '../output/styles.js';
import { normalizeTarget, invalidTargetMessage, type Target } from './ideTargets.js';
import { UserError } from '../utils/errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Targets that receive command/skill delivery. `copilot`/`cursor` have no known mechanism yet. */
export type CommandTarget = 'claude' | 'agents';

export interface CommandTargetDescriptor {
  /** Bundled asset subdirectory under commands/. */
  sourceDir: string;
  /** Project-relative install directory (project-local scope, the default). */
  localDir: string;
  /** Machine-level install directory (--global scope). */
  globalDir: () => string;
  /** Install/prune strategy: flat .md files under cf/, or one directory per skill. */
  layout: 'flat-md' | 'skill-dirs';
  /** Maps a raw installed entry name to how the user invokes it. */
  invocationHint: (entry: string) => string;
  /** Noun used in messages ("commands" vs "skills"). */
  noun: string;
  label: string;
}

/**
 * One entry per deliverable target — the `Record<CommandTarget, …>` annotation
 * makes the compiler reject a CommandTarget without a descriptor.
 */
export const COMMAND_TARGETS: Record<CommandTarget, CommandTargetDescriptor> = {
  claude: {
    sourceDir: 'cf',
    localDir: '.claude/commands',
    globalDir: () => path.join(os.homedir(), '.claude', 'commands'),
    layout: 'flat-md',
    invocationHint: (entry) => '/cf:' + entry.replace(/\.md$/, ''),
    noun: 'commands',
    label: 'Claude Code',
  },
  agents: {
    sourceDir: 'codex',
    localDir: '.agents/skills',
    // Codex's machine-level skills directory (design D2 — live-verified before merge).
    globalDir: () => path.join(os.homedir(), '.codex', 'skills'),
    layout: 'skill-dirs',
    invocationHint: (entry) => '$' + entry,
    noun: 'skills',
    label: 'Codex',
  },
};

function isCommandTarget(target: Target): target is CommandTarget {
  return target in COMMAND_TARGETS;
}

/**
 * Resolve user input ('claude', 'codex', 'openai', 'agents', …) to a deliverable
 * command target. Throws UserError for unknown targets and for valid IDE targets
 * with no command delivery (copilot, cursor) — an explicit error, not a no-op.
 */
export function resolveCommandTarget(input: string): CommandTarget {
  const normalized = normalizeTarget(input);
  if (!normalized) {
    throw new UserError(invalidTargetMessage(input));
  }
  if (!isCommandTarget(normalized)) {
    throw new UserError(
      `No command delivery exists for target '${normalized}'. ` +
        `Commands are available for: ${Object.keys(COMMAND_TARGETS).join(', ')} (aliases: codex, openai → agents).`,
    );
  }
  return normalized;
}

export interface InstallScopeOptions {
  /** Install to the machine-level directory instead of project-local. */
  global?: boolean;
  /** Explicit directory override — beats both scopes. */
  targetDir?: string;
}

/** Resolve the install directory for a target and scope. Project-local is the default. */
export function resolveInstallDir(target: CommandTarget, opts: InstallScopeOptions = {}): string {
  if (opts.targetDir) return path.resolve(opts.targetDir);
  const descriptor = COMMAND_TARGETS[target];
  return opts.global ? descriptor.globalDir() : path.resolve(process.cwd(), descriptor.localDir);
}

/** Resolve the bundled commands/ directory relative to this script's location. */
export function getSourceCommandsDir(): string {
  // In dist: dist/commands/commandInstaller.js → ../../commands/
  const resolved = path.resolve(__dirname, '..', '..', 'commands');
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Cannot locate bundled commands directory at ${resolved}. ` +
        'Ensure the package includes a commands/ directory.',
    );
  }
  return resolved;
}

export interface InstallResult {
  installed: string[];
  removed: string[];
}

/** flat-md layout: copy cf/*.md into targetDir/cf/, prune stale managed .md files. */
function installFlatMd(sourceDir: string, targetDir: string): InstallResult {
  const targetCfDir = path.join(targetDir, 'cf');
  fs.mkdirSync(targetCfDir, { recursive: true });

  const sourceFiles = new Set(fs.readdirSync(sourceDir).filter((f) => f.endsWith('.md')));
  for (const file of sourceFiles) {
    fs.copyFileSync(path.join(sourceDir, file), path.join(targetCfDir, file));
  }

  const removed: string[] = [];
  const targetFiles = fs.readdirSync(targetCfDir).filter((f) => f.endsWith('.md'));
  for (const file of targetFiles) {
    if (!sourceFiles.has(file)) {
      fs.rmSync(path.join(targetCfDir, file));
      removed.push(file);
    }
  }

  return { installed: [...sourceFiles], removed };
}

/** Names of bundled skill directories (subdirectories containing a SKILL.md). */
function bundledSkillNames(sourceDir: string): string[] {
  return fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(sourceDir, e.name, 'SKILL.md')))
    .map((e) => e.name);
}

/**
 * skill-dirs layout: copy each bundled skill directory into targetDir, then prune
 * stale managed directories. "Managed" = `cf-` prefix AND contains a SKILL.md —
 * the prefix marks CF ownership (the analogue of the cf/ subdirectory in the flat
 * layout); the SKILL.md check keeps non-skill directories that merely share the
 * prefix untouched. Other skills in the directory (e.g. the guide's workflow
 * skills) are never touched.
 */
function installSkillDirs(sourceDir: string, targetDir: string): InstallResult {
  fs.mkdirSync(targetDir, { recursive: true });

  const sourceSkills = new Set(bundledSkillNames(sourceDir));
  for (const skill of sourceSkills) {
    fs.cpSync(path.join(sourceDir, skill), path.join(targetDir, skill), { recursive: true });
  }

  const removed: string[] = [];
  for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('cf-') || sourceSkills.has(entry.name)) continue;
    if (!fs.existsSync(path.join(targetDir, entry.name, 'SKILL.md'))) continue;
    fs.rmSync(path.join(targetDir, entry.name), { recursive: true });
    removed.push(entry.name);
  }

  return { installed: [...sourceSkills], removed };
}

/**
 * Install a target's bundled command assets into targetDir (layout per descriptor).
 * Creates directories as needed, overwrites existing files (idempotent), and
 * removes stale managed entries no longer present in the source.
 */
export function installCommands(target: CommandTarget, targetDir: string): InstallResult {
  const descriptor = COMMAND_TARGETS[target];
  const sourceDir = path.join(getSourceCommandsDir(), descriptor.sourceDir);
  return descriptor.layout === 'flat-md'
    ? installFlatMd(sourceDir, targetDir)
    : installSkillDirs(sourceDir, targetDir);
}

/**
 * Remove managed command assets from the target.
 * "Managed" = entries present in the bundled source for this target.
 * Preserves user-added entries. flat-md removes cf/ if left empty; skill-dirs
 * never removes the parent directory (it is shared with other skills).
 * Idempotent — no error if files or directories don't exist.
 */
export function uninstallCommands(target: CommandTarget, targetDir: string): string[] {
  const descriptor = COMMAND_TARGETS[target];
  const sourceDir = path.join(getSourceCommandsDir(), descriptor.sourceDir);
  const removed: string[] = [];

  if (descriptor.layout === 'flat-md') {
    const managedFiles = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.md'));
    const targetCfDir = path.join(targetDir, 'cf');
    for (const file of managedFiles) {
      const filePath = path.join(targetCfDir, file);
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath);
        removed.push(file);
      }
    }
    if (fs.existsSync(targetCfDir) && fs.readdirSync(targetCfDir).length === 0) {
      fs.rmdirSync(targetCfDir);
    }
  } else {
    for (const skill of bundledSkillNames(sourceDir)) {
      const skillDir = path.join(targetDir, skill);
      if (fs.existsSync(skillDir)) {
        fs.rmSync(skillDir, { recursive: true });
        removed.push(skill);
      }
    }
  }

  return removed;
}

function reportInstall(target: CommandTarget, dir: string, result: InstallResult): void {
  const descriptor = COMMAND_TARGETS[target];
  const installedDir = descriptor.layout === 'flat-md' ? path.join(dir, 'cf') : dir;
  console.log(success(`Installed ${result.installed.length} ${descriptor.noun} to ${installedDir} (${descriptor.label})`));
  for (const entry of result.installed) {
    console.log(`  ${dim(descriptor.invocationHint(entry))}`);
  }
  if (result.removed.length > 0) {
    console.log(
      dim(
        `Removed ${result.removed.length} stale ${descriptor.noun}: ${result.removed
          .map((e) => descriptor.invocationHint(e))
          .join(', ')}`,
      ),
    );
  }
}

/** Install and report for an already-resolved command target. Errors propagate. */
export function installCommandsForTarget(target: CommandTarget, opts: InstallScopeOptions = {}): void {
  const dir = resolveInstallDir(target, opts);
  reportInstall(target, dir, installCommands(target, dir));
}

/** Install and report, resolving the target from user input. Errors propagate. */
export function installCommandsAction(ide: string = 'claude', opts: InstallScopeOptions = {}): void {
  installCommandsForTarget(resolveCommandTarget(ide), opts);
}

interface InstallCliOptions {
  ide: string;
  global?: boolean;
  target?: string;
}

export function registerInstallCommandsCommand(program: Command): void {
  program
    .command('install-commands')
    .description('Install Context Forge slash commands (Claude Code) or agent skills (Codex)')
    .option('--ide <target>', 'IDE target: claude, agents (aliases: openai, codex)', 'claude')
    .option('--global', 'Install to the machine-level directory instead of project-local')
    .option('--target <dir>', 'Explicit target directory (overrides --ide/--global resolution)')
    .action((opts: InstallCliOptions) => {
      try {
        installCommandsAction(opts.ide, { global: opts.global, targetDir: opts.target });
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}

export function registerUninstallCommandsCommand(program: Command): void {
  program
    .command('uninstall-commands')
    .description('Remove Context Forge slash commands (Claude Code) or agent skills (Codex)')
    .option('--ide <target>', 'IDE target: claude, agents (aliases: openai, codex)', 'claude')
    .option('--global', 'Uninstall from the machine-level directory instead of project-local')
    .option('--target <dir>', 'Explicit target directory (overrides --ide/--global resolution)')
    .action((opts: InstallCliOptions) => {
      try {
        const target = resolveCommandTarget(opts.ide);
        const descriptor = COMMAND_TARGETS[target];
        const dir = resolveInstallDir(target, { global: opts.global, targetDir: opts.target });
        const removed = uninstallCommands(target, dir);
        if (removed.length === 0) {
          console.log(dim(`No ${descriptor.noun} found to remove.`));
        } else {
          console.log(success(`Removed ${removed.length} ${descriptor.noun} from ${dir}`));
          for (const entry of removed) {
            console.log(`  ${dim(descriptor.invocationHint(entry))}`);
          }
        }
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
    });
}
