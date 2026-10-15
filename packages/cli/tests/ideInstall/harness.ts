/**
 * Snapshot harness for the setup-ide port, ported from the guide's
 * tests/setup_ide/harness.py. It builds a throwaway guide and project, calls
 * installIde in-process with a capturing sink, and renders the result in the
 * exact `.snap` layout the bash suite wrote, so the copied snapshots are the spec.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import { normalizeTarget } from '../../src/commands/ideTargets.js';
import { INSTALL_PATHS } from '../../src/ideInstall/dryRun.js';
import { installIde } from '../../src/ideInstall/installer.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURE_GUIDE = path.join(HERE, 'fixture_guide');
export const FIXTURE_DATA = path.join(HERE, 'fixture_data');
const SNAPSHOT_DIR = path.join(HERE, 'snapshots');

/** Repo root of context-forge; its installed guide feeds the real-guide smoke test. */
export const REPO_ROOT = path.resolve(HERE, '../../../..');

const ANSI_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
const NO_FINAL_NEWLINE = '<no final newline>';

export type FileContent = string | Buffer;

/** One install run: raw output plus what normalization needs. */
export interface RunResult {
  args: readonly string[];
  code: number;
  stdout: string;
  stderr: string;
  guide: string;
}

/** Plain code-unit order, as Python sorts strings. */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ide-install-'));
}

/** Copy a project-guides tree (the fixture guide by default) into dest. */
export function makeGuide(dest: string, guides: string = FIXTURE_GUIDE): string {
  fs.cpSync(guides, path.join(dest, 'project-guides'), { recursive: true });
  return dest;
}

/** Create <tmp>/project with the guide at project-documents/ai-project-guide. */
export function makeProject(
  tmp: string,
  guides: string = FIXTURE_GUIDE,
): { project: string; guide: string } {
  const project = path.join(tmp, 'project');
  const guide = path.join(project, 'project-documents', 'ai-project-guide');
  fs.mkdirSync(guide, { recursive: true });
  makeGuide(guide, guides);
  return { project, guide };
}

/** Write {relpath: content} under root. Buffer content is written as is. */
export function writeFiles(root: string, files: Record<string, FileContent>): void {
  for (const [rel, content] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

export interface RunOptions {
  /** The rules.exclude patterns cf would pass. */
  rulesExclude?: readonly string[];
}

/**
 * Install into `root` from `guide`. `args` is the bash command line the run
 * stands for (target and flags, e.g. `['claude', '--dry-run']`): it sets the
 * options and becomes the snapshot's run label, so the headers stay unchanged.
 */
export function run(
  guide: string,
  root: string,
  args: readonly string[],
  options: RunOptions = {},
): RunResult {
  const targetArg = args.find((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--root');
  const target = targetArg === undefined ? null : normalizeTarget(targetArg);
  if (target === null) throw new Error(`harness: no valid target in ${args.join(' ')}`);

  let stdout = '';
  let stderr = '';
  const result = installIde({
    guideDir: guide,
    projectRoot: root,
    targetRoot: root,
    target,
    dryRun: args.includes('--dry-run'),
    writeLint: args.includes('--write-lint'),
    force: args.includes('--force'),
    rulesExclude: options.rulesExclude ?? [],
    out: { stdout: (text) => (stdout += text), stderr: (text) => (stderr += text) },
  });
  return { args, code: result.exitCode, stdout, stderr, guide };
}

/**
 * The path as given, resolved, and with macOS's /private prefix added or
 * removed, longest first so nested paths are replaced before their parents.
 */
function pathVariants(p: string): string[] {
  const variants = new Set([p, fs.realpathSync(p)]);
  for (const text of [...variants]) {
    variants.add(text.startsWith('/private/') ? text.slice('/private'.length) : '/private' + text);
  }
  return [...variants].sort((a, b) => b.length - a.length);
}

function tempBases(): string[] {
  const tmp = os.tmpdir();
  const bases = new Set([tmp, fs.realpathSync(tmp), '/tmp', '/private/tmp', '/var/folders', '/private/var/folders']);
  return [...bases].sort((a, b) => b.length - a.length);
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Strip ANSI codes; replace the guide, project root and other temp paths. */
export function normalize(text: string, root: string, guide: string): string {
  let result = text.replace(ANSI_RE, '');
  for (const variant of pathVariants(guide)) result = result.split(variant).join('<GUIDE>');
  for (const variant of pathVariants(root)) result = result.split(variant).join('<ROOT>');
  for (const base of tempBases()) {
    result = result.replace(new RegExp(escapeRegExp(base) + `[^\\s'"):,]*`, 'g'), '<TMP>');
  }
  return result;
}

/** File contents as UTF-8 with CR shown as \r, flagging a missing final newline. */
function renderFile(file: string): string {
  let text = fs.readFileSync(file, 'utf-8').replaceAll('\r', '\\r');
  if (text !== '' && !text.endsWith('\n')) text += '\n' + NO_FINAL_NEWLINE + '\n';
  return text;
}

function isEmptyDir(dir: string): boolean {
  return fs.readdirSync(dir).length === 0;
}

/** Every file and empty directory below dir, keyed by root-relative path. */
function walk(root: string, dir: string, entries: Map<string, string | null>): void {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(root, full).split(path.sep).join('/');
    const stat = fs.statSync(full);
    if (stat.isFile()) {
      entries.set(rel, full);
    } else if (stat.isDirectory()) {
      if (isEmptyDir(full)) entries.set(rel + '/', null);
      walk(root, full, entries);
    }
  }
}

/** (relative path, file or null for an empty directory), sorted by path. */
function installEntries(root: string): [string, string | null][] {
  const entries = new Map<string, string | null>();
  for (const name of INSTALL_PATHS) {
    const top = path.join(root, name);
    if (!fs.existsSync(top)) continue;
    const stat = fs.statSync(top);
    if (stat.isFile()) {
      entries.set(name, top);
    } else if (stat.isDirectory()) {
      if (isEmptyDir(top)) entries.set(name + '/', null);
      walk(root, top, entries);
    }
  }
  return [...entries.entries()].sort(([a], [b]) => byCodeUnit(a, b));
}

/** Content of every file under the install paths, keyed by relative path. */
export function installFiles(root: string): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (const [rel, file] of installEntries(root)) {
    if (file !== null) files.set(rel, fs.readFileSync(file));
  }
  return files;
}

/** Snapshot text: every run (label, exit code, output), then install files. */
export function snapshot(root: string, runs: readonly RunResult[]): string {
  const out: string[] = [];
  runs.forEach((result, index) => {
    const label = normalize(['setup-ide', ...result.args].join(' '), root, result.guide);
    out.push(`== run ${index + 1}: ${label}`);
    out.push(`exit: ${result.code}`);
    for (const [stream, text] of [['stdout', result.stdout], ['stderr', result.stderr]] as const) {
      out.push(`-- ${stream}`);
      const body = normalize(text, root, result.guide);
      if (body !== '') out.push(body.replace(/\n+$/, ''));
    }
  });
  out.push('== files');
  for (const [rel, file] of installEntries(root)) {
    if (file === null) {
      out.push(`--- ${rel} (empty directory)`);
      continue;
    }
    out.push(`--- ${rel}`);
    out.push(renderFile(file).replace(/\n+$/, ''));
  }
  return out.join('\n') + '\n';
}

/** Every file and empty directory under root, for before/after asserts. */
export function tree(root: string): Map<string, Buffer> {
  const entries = new Map<string, string | null>();
  walk(root, root, entries);
  const result = new Map<string, Buffer>();
  for (const [rel, file] of [...entries.entries()].sort(([a], [b]) => byCodeUnit(a, b))) {
    result.set(rel, file === null ? Buffer.alloc(0) : fs.readFileSync(file));
  }
  return result;
}

/** Compare with snapshots/<name>.snap. `vitest -u` is the only update trigger. */
export async function assertSnapshot(name: string, text: string): Promise<void> {
  await expect(text).toMatchFileSnapshot(path.join(SNAPSHOT_DIR, `${name}.snap`));
}
