/**
 * Reader for the guide's install manifest, `.context-forge/<target>.manifest`.
 *
 * The manifest is written by the guide's `setup-ide` script (ai-project-guide
 * v0.19.0+): one line per wholesale-installed file, `<crc> <size> <path>`, with
 * the CRC from POSIX `cksum`. The line format and the CRC are an interface with
 * the guide. A guide change to either (e.g. a different hash) is a breaking
 * change for cf: worktree pruning compares these values byte for byte.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { UserError } from '../utils/errors.js';

/** Directory, relative to a checkout root, that holds the install manifests. */
export const MANIFEST_DIR = '.context-forge';

export interface ManifestEntry {
  crc: number;
  size: number;
  /** Root-relative, `/`-separated. */
  path: string;
}

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

/** Scratch file a manifest is staged in before being renamed into place. */
export function manifestTempPath(root: string, target: string): string {
  return path.join(root, MANIFEST_DIR, `.${target}.manifest.tmp`);
}

const NUMERIC = /^\d+$/;

/**
 * Parses one manifest line. Splits on the first two runs of whitespace, so the
 * rest of the line (spaces included) is the path. Returns null for a blank line;
 * throws on a line without a numeric CRC and size.
 */
export function parseManifestLine(line: string): ManifestEntry | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;

  const match = /^(\S+)\s+(\S+)\s+(.+)$/.exec(trimmed);
  if (!match || !NUMERIC.test(match[1]) || !NUMERIC.test(match[2])) {
    throw new Error(`expected '<crc> <size> <path>', got '${trimmed}'`);
  }
  return { crc: Number(match[1]), size: Number(match[2]), path: match[3] };
}

/**
 * Reads a checkout's manifest for a target. Returns null when the file is
 * missing (a guide older than v0.19.0), `[]` for an empty manifest (a target
 * that installs nothing wholesale). A malformed line throws a UserError naming
 * the file and line, so a partial baseline is never used.
 */
export function readManifest(root: string, target: string): ManifestEntry[] | null {
  const filePath = manifestPath(root, target);
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    // A missing manifest is the old-guide case, not an error.
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null;
    throw err;
  }

  const entries: ManifestEntry[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    let entry: ManifestEntry | null;
    try {
      entry = parseManifestLine(lines[i]);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new UserError(`Malformed install manifest ${filePath}, line ${i + 1}: ${reason}`);
    }
    if (entry) entries.push(entry);
  }
  return entries;
}
