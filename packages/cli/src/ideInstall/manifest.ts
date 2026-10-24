/**
 * The install manifest, `.context-forge/<target>.manifest`.
 *
 * One line per wholesale-installed file, `<crc> <size> <path>`, with the CRC
 * from POSIX `cksum`. The format is unchanged from the guide's bash setup-ide
 * (v0.19.0+), so a manifest either one wrote is read and updated by the other.
 * The merged composites (CLAUDE.md, AGENTS.md, copilot-instructions.md) are
 * never listed: they hold user content outside the managed block.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Target } from '../commands/ideTargets.js';
import { isDirectory, isEmptyDirectory, isFile } from './fsChecks.js';
import { byteOrder, toRecords } from './lines.js';
import type { Printer } from './output.js';
import { PREMANAGED_BACKUP_SUFFIX, relativeToRoot } from './paths.js';

/** Directory, relative to a checkout root, that holds the install manifests. */
export const MANIFEST_DIR = '.context-forge';

/** POSIX cksum generator polynomial, processed MSB-first. */
const CKSUM_POLYNOMIAL = 0x04c11db7;

const CKSUM_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let crc = i << 24;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x80000000 ? (crc << 1) ^ CKSUM_POLYNOMIAL : crc << 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

function cksumUpdate(crc: number, byte: number): number {
  return ((crc << 8) ^ CKSUM_TABLE[((crc >>> 24) ^ byte) & 0xff]) >>> 0;
}

/**
 * POSIX `cksum` CRC: CRC-32 over the bytes from an initial value of 0, then the
 * byte length appended least significant byte first (only as many bytes as
 * needed), then complemented. Matches the first field of `cksum < file`.
 */
export function cksum(buffer: Buffer): number {
  let crc = 0;
  for (const byte of buffer) {
    crc = cksumUpdate(crc, byte);
  }
  for (let length = buffer.length; length > 0; length = Math.floor(length / 256)) {
    crc = cksumUpdate(crc, length & 0xff);
  }
  return ~crc >>> 0;
}

/** File-name suffix of an install manifest. */
const MANIFEST_SUFFIX = '.manifest';

/** `<root>/.context-forge/<target>.manifest` */
export function manifestPath(root: string, target: string): string {
  return path.join(root, MANIFEST_DIR, `${target}${MANIFEST_SUFFIX}`);
}

/**
 * Every checkout-relative path listed by any `.context-forge/*.manifest`, in
 * manifest-name then line order. Blank lines are skipped; a line without the
 * three `<crc> <size> <path>` fields throws, naming its manifest. Paths may
 * contain spaces: the path is everything after the second space.
 */
export function readInstalledPaths(root: string): string[] {
  const dir = path.join(root, MANIFEST_DIR);
  if (!isDirectory(dir)) return [];
  const installed: string[] = [];
  for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(MANIFEST_SUFFIX)).sort(byteOrder)) {
    const file = path.join(dir, name);
    for (const line of toRecords(fs.readFileSync(file, 'utf-8'))) {
      if (line.trim() === '') continue;
      const fields = line.split(' ');
      const rel = fields.slice(2).join(' ');
      if (fields.length < 3 || rel === '') throw new Error(`${file}: malformed manifest line (expected "<crc> <size> <path>"): ${line}`);
      installed.push(rel);
    }
  }
  return installed;
}

// ─── Writer ──────────────────────────────────────────────────────────────────

/**
 * Files earlier guide versions installed and later dropped, before the manifest
 * existed. Same line format as a manifest, one line per shipped version. Read on
 * every run, so installs that predate the manifest are cleaned up too.
 */
const LEGACY_MANIFEST_ENTRIES: Record<Target, string> = {
  claude:
    '4163870229 9896 .claude/skills/analyze/SKILL.md\n' +
    '1743996119 8781 .claude/agents/code-review-agent.md\n' +
    '2426632181 8646 .claude/agents/code-review-agent.md\n' +
    '2637584951 8780 .claude/agents/code-review-agent.md\n' +
    '2820575936 8638 .claude/agents/code-review-agent.md\n' +
    '3243458359 8774 .claude/agents/code-review-agent.md\n',
  agents: '4163870229 9896 .agents/skills/analyze/SKILL.md\n',
  copilot: '4163870229 9896 .agents/skills/analyze/SKILL.md\n',
  cursor: '',
};

/** `cksum < file` output for these bytes: `<crc> <size>`. */
function cksumField(content: Buffer): string {
  return `${cksum(content)} ${content.length}`;
}

/** `cut -d' ' -f3-`: everything after the second space; a line with no space is kept whole. */
function pathField(line: string): string {
  const first = line.indexOf(' ');
  if (first === -1) return line;
  const second = line.indexOf(' ', first + 1);
  return second === -1 ? '' : line.slice(second + 1);
}

const BLANK = /[ \t]/;

/** The key of `sort -k3`: from the blank before field 3 to the end of the line. */
function sortKey3(line: string): string {
  let i = 0;
  for (let field = 0; field < 2; field++) {
    while (i < line.length && BLANK.test(line[i])) i++;
    while (i < line.length && !BLANK.test(line[i])) i++;
  }
  return line.slice(i);
}

/** `sort -k3` under LC_ALL=C: by key, then by the whole line. */
function bySortKey3(a: string, b: string): number {
  return byteOrder(sortKey3(a), sortKey3(b)) || byteOrder(a, b);
}

/**
 * One target's install run: ownership-checked writes, then stale-file pruning
 * and the new manifest (begin_manifest … finish_manifest).
 */
export class InstallManifest {
  private readonly lines: string[] = [];
  private readonly oldManifest: string;

  constructor(
    private readonly targetRoot: string,
    private readonly target: Target,
    private readonly out: Printer,
    /** `--force`: replace any differing file, edited or not, after backing it up. */
    private readonly force: boolean,
  ) {
    this.oldManifest = manifestPath(targetRoot, target);
  }

  /**
   * `install_file`: write content to dest unless that would overwrite a file
   * the guide does not own. Ownership is the previous manifest; identical
   * content is adopted. Without any manifest a differing file is left alone.
   * With force, a differing file is backed up and replaced regardless.
   * Returns false when the file was left alone.
   */
  installFile(content: Buffer, dest: string): boolean {
    const rel = relativeToRoot(this.targetRoot, dest);
    if (isFile(dest)) {
      const current = fs.readFileSync(dest);
      if (!current.equals(content)) {
        if (this.force) this.backUp(dest, rel);
        else if (!this.mayOverwrite(current, rel)) return false;
      }
    }
    fs.writeFileSync(dest, content);
    this.lines.push(`${cksumField(content)} ${rel}`);
    return true;
  }

  /** Single backup beside the file; a later forced run replaces it. */
  private backUp(dest: string, rel: string): void {
    const backup = dest + PREMANAGED_BACKUP_SUFFIX;
    fs.copyFileSync(dest, backup);
    this.out.status('yellow', `💾 Backed up ${rel} → ${path.basename(backup)}`);
  }

  private mayOverwrite(current: Buffer, rel: string): boolean {
    if (!isFile(this.oldManifest)) {
      this.out.status(
        'yellow',
        `⚠️  Skipped ${rel}: it differs from the guide's version and no install manifest shows the guide wrote it — remove it to let setup-ide manage it`,
      );
      return false;
    }
    const matches = toRecords(fs.readFileSync(this.oldManifest, 'utf-8')).filter(
      (line) => line.replace(/^[^ ]+ [^ ]+ /, '') === rel,
    );
    if (matches.length === 0) {
      this.out.status(
        'yellow',
        `⚠️  Skipped ${rel}: it exists and was not installed by the guide — rename or remove it to let setup-ide manage it`,
      );
      return false;
    }
    // Compared as one string, as bash did, so duplicate entries never match.
    if (`${cksumField(current)} ${rel}` !== matches.join('\n')) {
      // Edited since install: keep the edit and the original entry, so the
      // path stays guide-owned and the prune step does not warn a second time.
      this.lines.push(...matches);
      this.out.status(
        'yellow',
        `⚠️  Kept ${rel}: edited since it was installed, so the guide's update was not written — remove it to get the update`,
      );
      return false;
    }
    return true;
  }

  /** `finish_manifest`: delete stale unedited files, then write this run's manifest. */
  finish(): void {
    const oldText =
      (isFile(this.oldManifest) ? fs.readFileSync(this.oldManifest, 'utf-8') : '') +
      LEGACY_MANIFEST_ENTRIES[this.target];
    const oldLines = toRecords(oldText);
    const newPaths = new Set(this.lines.map(pathField));
    const stale = [...new Set(oldLines.map(pathField))]
      .sort(byteOrder)
      .filter((rel) => !newPaths.has(rel));

    for (const rel of stale) {
      const file = path.join(this.targetRoot, rel);
      if (rel === '' || !isFile(file)) continue;
      if (this.escapesTargetRoot(rel, file)) {
        this.out.status('yellow', `⚠️  Skipped ${rel}: path resolves outside the project`);
        continue;
      }
      // A legacy path has one entry per shipped version, so match any of them.
      if (oldLines.includes(`${cksumField(fs.readFileSync(file))} ${rel}`)) {
        fs.rmSync(file);
        this.removeEmptyInstallDirs(rel);
        this.out.status('green', `🧹 Removed ${rel} (no longer installed by the guide)`);
      } else {
        this.out.status(
          'yellow',
          `⚠️  Kept ${rel}: no longer installed by the guide, but edited since — remove it by hand if unneeded`,
        );
      }
    }

    fs.mkdirSync(path.join(this.targetRoot, MANIFEST_DIR), { recursive: true });
    const sorted = [...this.lines].sort(bySortKey3);
    fs.writeFileSync(this.oldManifest, sorted.map((line) => line + '\n').join(''));
  }

  /**
   * Manifest paths come from a committed, user-editable file, so a deletion must
   * stay inside the project: no absolute or `..` paths, and no symlinked
   * install directory redirecting it elsewhere.
   */
  private escapesTargetRoot(rel: string, file: string): boolean {
    if (path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel) || rel.split(/[\\/]/).includes('..')) {
      return true;
    }
    const root = fs.realpathSync(this.targetRoot);
    const parent = fs.realpathSync(path.dirname(file));
    return parent !== root && !parent.startsWith(root + path.sep);
  }

  /**
   * Remove directories emptied by a deletion, e.g. a skill's own folder. Stops
   * at two levels deep so install roots like .claude/skills are never removed.
   */
  private removeEmptyInstallDirs(rel: string): void {
    let dir = path.posix.dirname(rel);
    while (dir.split('/').length > 2) {
      const full = path.join(this.targetRoot, dir);
      if (!isDirectory(full) || !isEmptyDirectory(full)) return;
      fs.rmdirSync(full);
      dir = path.posix.dirname(dir);
    }
  }
}
