/** Builds the `devlog-size` consistency finding for one checkout (slice 936, D3/D5/D8/D9). */
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { DEVLOG_FILE, archiveRelPath, readUtf8Strict } from '../devlog/archiveDevlog.js';
import { assertDevlogLimits } from '../devlog/devlogLimits.js';
import { parseDevlog } from '../devlog/devlogSections.js';
import { NO_MOVE_REASON, NO_MOVE_REASON_TEXT, planDevlogArchive } from '../devlog/planDevlogArchive.js';
import type { ConsistencyFinding } from './types.js';

export const DEVLOG_SIZE_RULE = 'devlog-size';
export const ARCHIVE_DEVLOG_ACTION = 'archive-devlog' as const;

export interface DevlogSizeInput {
  checkoutPath: string;
  projectName: string;
  maxBytes: number;
  targetBytes: number;
}

/** A non-fixable `error` finding for an invalid setting or an I/O failure. */
export function devlogSizeErrorFinding(location: string, message: string): ConsistencyFinding {
  return {
    rule: DEVLOG_SIZE_RULE,
    severity: 'error',
    location,
    description: message,
    suggestedFix: 'Fix the cause named above, then re-run cf check',
    fixable: false,
  };
}

function causeText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Zero or one finding: DEVLOG.md is over `devlog.max_bytes`. Stats first; reads only when over. */
export async function buildDevlogSizeFinding(input: DevlogSizeInput): Promise<ConsistencyFinding | null> {
  const { checkoutPath, projectName, maxBytes, targetBytes } = input;
  const location = join(checkoutPath, DEVLOG_FILE);

  let size: number;
  try {
    size = (await stat(location)).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    return devlogSizeErrorFinding(location, `Cannot stat ${location}: ${causeText(error)}`);
  }
  if (size <= maxBytes) return null;

  try {
    assertDevlogLimits(maxBytes, targetBytes);
    const text = await readUtf8Strict(location);
    if (text === null) return null;
    const plan = planDevlogArchive(parseDevlog(text), targetBytes);
    const description = `${DEVLOG_FILE} is ${size} bytes, over devlog.max_bytes (${maxBytes})`;

    if (plan.movedCount === 0) {
      return {
        rule: DEVLOG_SIZE_RULE,
        severity: 'warning',
        location,
        description,
        suggestedFix: NO_MOVE_REASON_TEXT[plan.reason ?? NO_MOVE_REASON.WithinTarget],
        fixable: false,
      };
    }

    const additionalPaths: string[] = [];
    for (const key of plan.movedByQuarter.keys()) {
      const archivePath = join(checkoutPath, archiveRelPath(key));
      // An unreadable or non-UTF-8 archive makes the fix impossible; report it now.
      await readUtf8Strict(archivePath);
      additionalPaths.push(archivePath);
    }
    return {
      rule: DEVLOG_SIZE_RULE,
      severity: 'warning',
      location,
      description,
      suggestedFix: 'Run cf check --fix, or cf devlog archive',
      fixable: true,
      fixAction: {
        type: ARCHIVE_DEVLOG_ACTION,
        filePath: location,
        additionalPaths,
        detail: { targetBytes, projectName },
        subjectIndex: null,
      },
    };
  } catch (error) {
    return devlogSizeErrorFinding(location, causeText(error));
  }
}
