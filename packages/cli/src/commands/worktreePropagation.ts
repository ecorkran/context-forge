import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ProjectData } from '@context-forge/core';
import { UserError } from '../utils/errors.js';
import { GENERATED_MARKER, normalizeTarget, TARGETS, type TargetDescriptor } from './ideTargets.js';
import { cksum, manifestPath, readManifest, MANIFEST_DIR, type ManifestEntry } from './installManifest.js';

/** Printed once per run when the root has no manifest after the guide script (D4). */
const PRE_MANIFEST_NOTICE =
  "Note: guide predates the install manifest (v0.19.0); worktree files were copied but not pruned. Run 'cf guides update' to enable pruning.";

/** Why a stale path was not deleted; each reason prints its own warning. */
export type KeptReason = 'containment' | 'non-regular' | 'edited';

export interface KeptFile {
  path: string;
  reason: KeptReason;
}

export interface PruneResult {
  removed: string[];
  kept: KeptFile[];
}

/**
 * The guide's `remove_empty_install_dirs` depth rule: a now-empty directory is
 * removed only while its relative path has at least this many segments, so
 * `.claude/skills/analyze` can go but `.claude/skills` never does.
 */
const MIN_REMOVABLE_DIR_SEGMENTS = 3;

/** True if `candidate` is `root` or lies beneath it. Both must be resolved. */
function isWithin(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + path.sep);
}

/** Lexical containment: manifest paths come from a user-editable file. */
function escapesLexically(relPath: string): boolean {
  return path.isAbsolute(relPath) || /^[A-Za-z]:/.test(relPath) || relPath.split(/[\\/]/).includes('..');
}

function removeEmptyParents(worktreePath: string, relPath: string): void {
  let relDir = path.posix.dirname(relPath);
  while (relDir.split('/').length >= MIN_REMOVABLE_DIR_SEGMENTS) {
    const absDir = path.join(worktreePath, ...relDir.split('/'));
    if (fs.readdirSync(absDir).length > 0) return;
    fs.rmdirSync(absDir);
    relDir = path.posix.dirname(relDir);
  }
}

/**
 * Deletes worktree files the guide wrote (listed in a baseline entry) but no
 * longer installs (absent from the new root manifest), when the file's bytes
 * still match a baseline CRC and size. Each candidate is checked and deleted
 * immediately, with no batching. Filesystem errors propagate. Prints nothing.
 */
export function pruneStaleFiles(
  worktreePath: string,
  baselineEntries: readonly ManifestEntry[],
  newRootEntries: readonly ManifestEntry[],
): PruneResult {
  const result: PruneResult = { removed: [], kept: [] };
  const stillInstalled = new Set(newRootEntries.map((e) => e.path));
  const stalePaths = [...new Set(baselineEntries.map((e) => e.path))].filter((p) => !stillInstalled.has(p));
  const worktreeReal = fs.realpathSync(worktreePath);

  for (const relPath of stalePaths) {
    if (escapesLexically(relPath)) {
      result.kept.push({ path: relPath, reason: 'containment' });
      continue;
    }
    const absPath = path.join(worktreePath, ...relPath.split('/'));
    const stat = fs.lstatSync(absPath, { throwIfNoEntry: false });
    if (!stat) continue;
    // A symlinked install directory must not redirect a deletion outside the worktree.
    if (!isWithin(worktreeReal, fs.realpathSync(path.dirname(absPath)))) {
      result.kept.push({ path: relPath, reason: 'containment' });
      continue;
    }
    if (!stat.isFile()) {
      result.kept.push({ path: relPath, reason: 'non-regular' });
      continue;
    }
    const bytes = fs.readFileSync(absPath);
    const crc = cksum(bytes);
    const guideWritten = baselineEntries.some((e) => e.path === relPath && e.crc === crc && e.size === bytes.length);
    if (!guideWritten) {
      result.kept.push({ path: relPath, reason: 'edited' });
      continue;
    }
    fs.unlinkSync(absPath);
    removeEmptyParents(worktreePath, relPath);
    result.removed.push(relPath);
  }
  return result;
}

const KEPT_MESSAGES: Record<KeptReason, (relPath: string) => string> = {
  edited: (rel) => `Kept ${rel}: no longer installed by the guide, but edited since — remove it by hand if unneeded`,
  containment: (rel) => `Warning: skipped ${rel}: path resolves outside the worktree`,
  'non-regular': (rel) => `Warning: skipped ${rel}: not a regular file`,
};

/**
 * Prunes one worktree against baseline = its own manifest ∪ the root's pre-run
 * snapshot (D2). With neither baseline nothing is deleted.
 */
function pruneWorktree(
  wtPath: string,
  target: string,
  rootBaseline: readonly ManifestEntry[] | null,
  newRoot: readonly ManifestEntry[],
): void {
  const wtBaseline = readManifest(wtPath, target);
  if (wtBaseline === null && rootBaseline === null) return;

  const baseline = [...(wtBaseline ?? []), ...(rootBaseline ?? [])];
  const { removed, kept } = pruneStaleFiles(wtPath, baseline, newRoot);
  for (const rel of removed) {
    console.log(`    Removed ${rel} (no longer installed by the guide)`);
  }
  for (const { path: rel, reason } of kept) {
    console.log(`    ${KEPT_MESSAGES[reason](rel)}`);
  }
}

const PROMPT_FILE_SUFFIX = '.prompt.md';

/**
 * Deletes `*.prompt.md` files carrying GENERATED_MARKER from the given
 * worktree-relative dirs, mirroring the guide's marker check at the root, and
 * removes a dir this leaves empty. Unmarked files are user-authored and kept.
 * Returns the removed worktree-relative paths.
 */
export function sweepGeneratedPrompts(worktreePath: string, dirs: readonly string[]): string[] {
  const removed: string[] = [];
  for (const relDir of dirs) {
    const absDir = path.join(worktreePath, ...relDir.split('/'));
    if (!fs.existsSync(absDir)) continue;

    const swept = fs
      .readdirSync(absDir, { withFileTypes: true })
      .filter((d) => d.isFile() && d.name.endsWith(PROMPT_FILE_SUFFIX))
      .filter((d) => fs.readFileSync(path.join(absDir, d.name), 'utf-8').includes(GENERATED_MARKER));
    for (const d of swept) {
      fs.unlinkSync(path.join(absDir, d.name));
      removed.push(`${relDir}/${d.name}`);
    }
    if (swept.length > 0 && fs.readdirSync(absDir).length === 0) fs.rmdirSync(absDir);
  }
  return removed;
}

/** Byte copy of the root manifest via a temp file + rename, so it is never left truncated. */
function copyManifest(rootPath: string, wtPath: string, target: string): void {
  const dstPath = manifestPath(wtPath, target);
  const tmpPath = path.join(wtPath, MANIFEST_DIR, `.${target}.manifest.tmp`);
  fs.mkdirSync(path.dirname(dstPath), { recursive: true });
  fs.copyFileSync(manifestPath(rootPath, target), tmpPath);
  fs.renameSync(tmpPath, dstPath);
}

/** Copies the target's marker files and propagateDirs from the root into one worktree. */
function copyRootOutput(rootPath: string, wtPath: string, descriptor: TargetDescriptor): void {
  for (const relFile of descriptor.markerFiles) {
    const srcFile = path.join(rootPath, ...relFile.split('/'));
    if (!fs.existsSync(srcFile)) continue;
    const dstFile = path.join(wtPath, ...relFile.split('/'));
    fs.mkdirSync(path.dirname(dstFile), { recursive: true });
    fs.copyFileSync(srcFile, dstFile);
  }

  for (const relDir of descriptor.propagateDirs) {
    const srcDir = path.join(rootPath, ...relDir.split('/'));
    if (!fs.existsSync(srcDir)) continue;
    const dstDir = path.join(wtPath, ...relDir.split('/'));
    fs.cpSync(srcDir, dstDir, { recursive: true });
  }
}

/**
 * Propagate IDE-generated files from the project root to all registered worktrees.
 *
 * The setup-ide script always writes to the project root (its find_project_root()
 * walks up to the nearest directory containing project-documents/, which is always
 * the root). Worktrees share the same guides submodule source but have independent
 * working trees, so without propagation their compiled IDE files go stale after
 * every root setup-ide run.
 *
 * Descriptor-driven: each target's `markerFiles` and `propagateDirs` (see TARGETS)
 * define exactly what is copied. `.claude/settings.local.json` and `.claude/worktrees/`
 * stay out because neither appears in any target's `propagateDirs` — the former is
 * worktree-specific, the latter is the cf worktree registry and root-only.
 */
export function propagateToWorktrees(
  project: ProjectData,
  target: string,
  rootBaseline: readonly ManifestEntry[] | null,
): void {
  const rootPath = project.projectPath!;
  const resolvedRootPath = path.resolve(rootPath);

  // WorktreeService migrates a project's pre-worktree workflow fields into a
  // "default" worktree context whose worktreePath IS the project root (see
  // WorktreeService.ts). Propagating the root onto itself is a no-op at best;
  // fs.cpSync throws ERR_FS_CP_EINVAL when src and dest are the same path, so
  // this must be filtered out rather than merely being harmless.
  const worktrees = (project.worktrees ?? []).filter(
    (wt) => wt.worktreePath && fs.existsSync(wt.worktreePath) && path.resolve(wt.worktreePath) !== resolvedRootPath,
  );
  if (worktrees.length === 0) return;

  const resolvedTarget = normalizeTarget(target);
  if (!resolvedTarget) {
    throw new UserError(`No propagation descriptor for target '${target}'.`);
  }
  const descriptor = TARGETS[resolvedTarget];

  // Read after the guide script ran. null = the guide predates the manifest (D4).
  const newRoot = readManifest(rootPath, resolvedTarget);

  for (const wt of worktrees) {
    const wtPath = wt.worktreePath!;
    console.log(`  → propagating to worktree: ${wt.name ?? wt.id} (${wtPath})`);
    copyRootOutput(rootPath, wtPath, descriptor);
    if (newRoot !== null) pruneWorktree(wtPath, resolvedTarget, rootBaseline, newRoot);
    // Runs on the D4 path too: generated prompt files are never in any manifest.
    for (const rel of sweepGeneratedPrompts(wtPath, descriptor.generatedPromptDirs ?? [])) {
      console.log(`    Removed superseded prompt file: ${rel}`);
    }
    // Last per worktree: an earlier failure leaves the old manifest in place.
    if (newRoot !== null) copyManifest(rootPath, wtPath, resolvedTarget);
  }

  if (newRoot === null) {
    console.log(`  ${PRE_MANIFEST_NOTICE}`);
  }
  console.log(`  Propagated to ${worktrees.length} worktree${worktrees.length !== 1 ? 's' : ''}.`);
}
