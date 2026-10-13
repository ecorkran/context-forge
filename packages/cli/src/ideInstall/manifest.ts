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
import { relativeToRoot } from './paths.js';

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

/** `<root>/.context-forge/<target>.manifest` */
export function manifestPath(root: string, target: string): string {
  return path.join(root, MANIFEST_DIR, `${target}.manifest`);
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
  ) {
    this.oldManifest = manifestPath(targetRoot, target);
  }

  /**
   * `install_file`: write content to dest unless that would overwrite a file
   * the guide does not own. Ownership is the previous manifest; identical
   * content is adopted. Without any manifest a differing file is left alone.
   * Returns false when the file was left alone.
   */
  installFile(content: Buffer, dest: string): boolean {
    const rel = relativeToRoot(this.targetRoot, dest);
    if (isFile(dest)) {
      const current = fs.readFileSync(dest);
      if (!current.equals(content) && !this.mayOverwrite(current, rel)) return false;
    }
    fs.writeFileSync(dest, content);
    this.lines.push(`${cksumField(content)} ${rel}`);
    return true;
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
