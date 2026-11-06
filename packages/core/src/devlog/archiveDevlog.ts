/** Read, plan and write the DEVLOG rollover into quarterly archives (slice 936, D6/D11). */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildArchiveText } from './archiveText.js';
import { assertDevlogLimits } from './devlogLimits.js';
import { parseDevlog } from './devlogSections.js';
import { NO_MOVE_REASON, planDevlogArchive, type ArchivePlan, type NoMoveReason } from './planDevlogArchive.js';

export const DEVLOG_FILE = 'DEVLOG.md';
export const DEVLOG_ARCHIVE_DIR = 'project-documents/user/archive/devlog';

export interface ArchiveDevlogOptions {
  checkoutPath: string;
  maxBytes: number;
  targetBytes: number;
  projectName: string;
  /** Date written into new archive frontmatter (YYYYMMDD); passed in, never read from a clock. */
  today: string;
  dryRun: boolean;
  /** Test seam: awaited after the archive writes and before the final re-read. Production never sets it. */
  beforeFinalWrite?: () => Promise<void>;
}

export interface ArchivedFile {
  /** Path relative to the checkout. */
  relPath: string;
  /** Sections moved into this archive. */
  sectionCount: number;
}

export type ArchiveDevlogResult =
  | { status: 'within-limit'; sizeBytes: number }
  | { status: 'nothing-movable'; sizeBytes: number; reason: NoMoveReason }
  | {
      status: 'archived' | 'dry-run';
      beforeBytes: number;
      afterBytes: number;
      movedCount: number;
      archives: ArchivedFile[];
    };

/** Archive file path, relative to the checkout, for a `YYYY-Qn` key. */
export function archiveRelPath(quarterKey: string): string {
  return `${DEVLOG_ARCHIVE_DIR}/DEVLOG-${quarterKey}.md`;
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException).code;
}

function causeText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Strict UTF-8 read: a lenient decode would corrupt the file when written back. Null when absent. */
export async function readUtf8Strict(path: string): Promise<string | null> {
  let buffer: Buffer;
  try {
    buffer = await readFile(path);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
    throw new Error(`Cannot read ${path}: ${causeText(error)}`, { cause: error });
  }
  try {
    // ignoreBOM keeps a leading BOM in the text so a write-back is byte-identical.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch (error) {
    throw new Error(`Cannot read ${path}: not valid UTF-8`, { cause: error });
  }
}

/** Compute every archive's new text in memory. Archives with nothing new to add are omitted. */
async function planArchiveWrites(
  checkoutPath: string,
  plan: ArchivePlan,
  projectName: string,
  today: string,
): Promise<Map<string, string>> {
  const writes = new Map<string, string>();
  for (const [key, moved] of plan.movedByQuarter) {
    const relPath = archiveRelPath(key);
    const existing = await readUtf8Strict(join(checkoutPath, relPath));
    const text = buildArchiveText({ existing, moved, quarterLabel: key.replace('-', ' '), projectName, today });
    if (text !== null) writes.set(relPath, text);
  }
  return writes;
}

function failureWithWritten(cause: string, written: string[]): Error {
  if (written.length === 0) return new Error(cause);
  return new Error(
    `${cause}. Already written: ${written.join(', ')}. No rollback was done; review them with \`git diff\`.`,
  );
}

async function writeAll(
  checkoutPath: string,
  devlogPath: string,
  original: string,
  keptText: string,
  writes: Map<string, string>,
  beforeFinalWrite: (() => Promise<void>) | undefined,
): Promise<void> {
  const written: string[] = [];
  try {
    await mkdir(join(checkoutPath, DEVLOG_ARCHIVE_DIR), { recursive: true });
    for (const [relPath, text] of writes) {
      await writeFile(join(checkoutPath, relPath), text, 'utf8');
      written.push(relPath);
    }
    if (beforeFinalWrite) await beforeFinalWrite();
    // D11: an agent may have edited DEVLOG.md during the run; never overwrite its change.
    if ((await readUtf8Strict(devlogPath)) !== original) {
      throw new Error(`${DEVLOG_FILE} changed during the run; it was not modified`);
    }
    await writeFile(devlogPath, keptText, 'utf8');
  } catch (error) {
    throw failureWithWritten(causeText(error), written);
  }
}

export async function archiveDevlog(options: ArchiveDevlogOptions): Promise<ArchiveDevlogResult> {
  const { checkoutPath, maxBytes, targetBytes, projectName, today, dryRun } = options;
  assertDevlogLimits(maxBytes, targetBytes);
  const devlogPath = join(checkoutPath, DEVLOG_FILE);

  let sizeBytes: number;
  try {
    sizeBytes = (await stat(devlogPath)).size;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') throw new Error(`${DEVLOG_FILE} not found at ${devlogPath}`, { cause: error });
    throw new Error(`Cannot stat ${devlogPath}: ${causeText(error)}`, { cause: error });
  }
  if (sizeBytes <= maxBytes) return { status: 'within-limit', sizeBytes };

  const original = await readUtf8Strict(devlogPath);
  if (original === null) throw new Error(`${DEVLOG_FILE} not found at ${devlogPath}`);
  const plan = planDevlogArchive(parseDevlog(original), targetBytes);
  if (plan.movedCount === 0) {
    return { status: 'nothing-movable', sizeBytes, reason: plan.reason ?? NO_MOVE_REASON.WithinTarget };
  }

  const writes = await planArchiveWrites(checkoutPath, plan, projectName, today);
  const archives = [...plan.movedByQuarter].map(([key, moved]) => ({
    relPath: archiveRelPath(key),
    sectionCount: moved.length,
  }));
  const report = {
    beforeBytes: sizeBytes,
    afterBytes: Buffer.byteLength(plan.keptText, 'utf8'),
    movedCount: plan.movedCount,
    archives,
  };
  if (dryRun) return { status: 'dry-run', ...report };

  await writeAll(checkoutPath, devlogPath, original, plan.keptText, writes, options.beforeFinalWrite);
  return { status: 'archived', ...report };
}
