/** Builds the `devlog-size` consistency finding for one checkout (slice 936, D3/D5/D8/D9). */
import { join } from 'node:path';
import { DEVLOG_FILE, archiveRelPath, readUtf8Strict, statDevlogSize } from '../devlog/archiveDevlog.js';
import { causeText } from '../devlog/errorText.js';
import { assertDevlogLimits, readRawDevlogLimits, type DevlogLimits } from '../devlog/devlogLimits.js';
import type { ConfigManager } from '../config/ConfigManager.js';
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

/** `fixAction.detail` of an archive-devlog fix. */
export interface ArchiveDevlogDetail {
  targetBytes: number;
  projectName: string;
}

/** Narrow an untyped fixAction detail; throws when it is not an archive-devlog detail. */
export function parseArchiveDevlogDetail(detail: Record<string, unknown>): ArchiveDevlogDetail {
  const { targetBytes, projectName } = detail;
  if (typeof targetBytes !== 'number' || typeof projectName !== 'string') {
    throw new Error('archive-devlog fix has no valid targetBytes and projectName in its detail');
  }
  return { targetBytes, projectName };
}

/** Zero or one finding: DEVLOG.md is over `devlog.max_bytes`. Stats first; reads only when over. */
export async function buildDevlogSizeFinding(input: DevlogSizeInput): Promise<ConsistencyFinding | null> {
  const { checkoutPath, projectName, maxBytes, targetBytes } = input;
  const location = join(checkoutPath, DEVLOG_FILE);

  let size: number | null;
  try {
    size = await statDevlogSize(location);
  } catch (error) {
    return devlogSizeErrorFinding(location, causeText(error));
  }
  if (size === null) return null;
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
        detail: { targetBytes, projectName } satisfies ArchiveDevlogDetail,
        subjectIndex: null,
      },
    };
  } catch (error) {
    return devlogSizeErrorFinding(location, causeText(error));
  }
}

/** The rule's entry point: read the limits (a bad value becomes an error finding), then build the finding. */
export async function devlogSizeFindings(
  config: ConfigManager,
  checkoutPath: string,
  projectName: string,
): Promise<ConsistencyFinding[]> {
  let limits: DevlogLimits;
  try {
    limits = await readRawDevlogLimits(config);
  } catch (error) {
    return [devlogSizeErrorFinding(join(checkoutPath, DEVLOG_FILE), causeText(error))];
  }
  const finding = await buildDevlogSizeFinding({ checkoutPath, projectName, ...limits });
  return finding ? [finding] : [];
}
