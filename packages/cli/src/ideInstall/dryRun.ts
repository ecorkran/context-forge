/**
 * Dry run (`dry_run_install`): install into a sandbox copy of the project's
 * install paths, then report what would be added, changed and removed. The
 * project is never touched.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Target } from '../commands/ideTargets.js';
import { exists } from './fsChecks.js';
import { byteOrder, toRecords } from './lines.js';
import { MANIFEST_DIR } from './manifest.js';
import { Printer, StdoutBuffer } from './output.js';
import { DRY_RUN_SKIP_PATH, LINT_WRITE_PATHS, PREMANAGED_BACKUP_SUFFIX } from './paths.js';
import type { InstallBase } from './installer.js';

/** Prefix of the sandbox directory under the OS temp dir. */
export const DRY_RUN_SANDBOX_PREFIX = 'cf-setup-ide-dry-run-';

/** Top-level paths any target may write, relative to the target root. */
export const INSTALL_PATHS = [
  'CLAUDE.md',
  `CLAUDE.md${PREMANAGED_BACKUP_SUFFIX}`,
  'AGENTS.md',
  `AGENTS.md${PREMANAGED_BACKUP_SUFFIX}`,
  '.claude',
  '.cursor',
  '.github',
  '.agents',
  MANIFEST_DIR,
  ...LINT_WRITE_PATHS,
];

/** Lines of the sandbox run worth showing: warnings, skips and errors. */
const DRY_RUN_KEEP = /⚠️|⊘|❌/;

function copyInstallPaths(realRoot: string, sandbox: string): void {
  const skip = path.join(realRoot, DRY_RUN_SKIP_PATH);
  for (const rel of INSTALL_PATHS) {
    const source = path.join(realRoot, rel);
    if (!exists(source)) continue;
    fs.cpSync(source, path.join(sandbox, rel), {
      recursive: true,
      verbatimSymlinks: true,
      filter: (src) => src !== skip,
    });
  }
}

/** `find <path> -type f` below root, skipping the worktrees folder: root-relative paths. */
function regularFilesUnder(root: string, rel: string, files: string[]): void {
  if (rel === DRY_RUN_SKIP_PATH) return;
  const stat = fs.lstatSync(path.join(root, rel));
  if (stat.isFile()) {
    files.push(rel);
  } else if (stat.isDirectory()) {
    for (const name of fs.readdirSync(path.join(root, rel))) regularFilesUnder(root, `${rel}/${name}`, files);
  }
}

/** `list_install_files`: install-path files relative to root, in byte order. */
function listInstallFiles(root: string): string[] {
  const files: string[] = [];
  for (const rel of INSTALL_PATHS) {
    if (exists(path.join(root, rel))) regularFilesUnder(root, rel, files);
  }
  return files.sort(byteOrder);
}

function sameContent(a: string, b: string): boolean {
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

/** `report_dry_run_changes`: `+` added, `~` modified, `-` removed, each group in byte order. */
function reportChanges(realRoot: string, sandbox: string, out: Printer): void {
  const before = listInstallFiles(realRoot);
  const after = listInstallFiles(sandbox);
  const beforeSet = new Set(before);
  const afterSet = new Set(after);

  const added = after.filter((rel) => !beforeSet.has(rel));
  const modified = after.filter(
    (rel) => beforeSet.has(rel) && !sameContent(path.join(realRoot, rel), path.join(sandbox, rel)),
  );
  const removed = before.filter((rel) => !afterSet.has(rel));

  for (const rel of added) out.status('green', `  + ${rel}`);
  for (const rel of modified) out.status('yellow', `  ~ ${rel}`);
  for (const rel of removed) out.status('red', `  - ${rel}`);

  const count = added.length + modified.length + removed.length;
  out.status(
    'blue',
    count === 0 ? '📋 No changes' : `📋 ${count} file(s) would change (+ add, ~ modify, - remove)`,
  );
}

/**
 * Runs `install` against a sandbox copy and reports the difference. The run's
 * stdout is buffered and only its warning lines are replayed; its stderr passes
 * through. The sandbox is removed even when the install aborts or throws (bash
 * leaked it then); a failed removal is reported on stderr.
 */
export function dryRunInstall(
  target: Target,
  base: InstallBase,
  install: (target: Target, base: InstallBase) => void,
): void {
  const realRoot = base.targetRoot;
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), DRY_RUN_SANDBOX_PREFIX));
  try {
    copyInstallPaths(realRoot, sandbox);
    const log = new StdoutBuffer(base.out.sink);
    install(target, { ...base, targetRoot: sandbox, out: new Printer(log) });

    base.out.status('blue', `🔍 Dry run for '${target}' — nothing was written`);
    for (const line of toRecords(log.text())) {
      if (DRY_RUN_KEEP.test(line)) base.out.raw(line + '\n');
    }
    reportChanges(realRoot, sandbox, base.out);
  } finally {
    removeSandbox(sandbox, base.out);
  }
}

/**
 * Cleanup must not replace the install's own error. A leftover temp dir is
 * harmless, so a failed removal is reported on stderr instead of thrown.
 */
function removeSandbox(sandbox: string, out: Printer): void {
  try {
    fs.rmSync(sandbox, { recursive: true, force: true });
  } catch (err) {
    out.statusErr('yellow', `⚠️  Could not remove dry-run sandbox ${sandbox}: ${String(err)}`);
  }
}
