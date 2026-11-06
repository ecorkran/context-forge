/** The `archive-devlog` fix: run the writer for a devlog-size finding (slice 936 D9). */
import { dirname, join } from 'node:path';
import type { ConfigManager } from '../config/ConfigManager.js';
import { archiveDevlog } from '../devlog/archiveDevlog.js';
import { readDevlogLimits } from '../devlog/devlogLimits.js';
import { ARCHIVE_DEVLOG_ACTION, parseArchiveDevlogDetail } from './devlogSizeFinding.js';
import type { ConsistencyFinding, FixLogEntry } from './types.js';

/** Returns null when the file no longer needs archiving; writer failures throw. */
export async function applyArchiveDevlogFix(
  config: ConfigManager | undefined,
  finding: ConsistencyFinding,
  today: string,
): Promise<FixLogEntry | null> {
  if (!config) throw new Error('archive-devlog needs a ConfigManager to read devlog.max_bytes');
  if (!finding.fixAction) throw new Error('archive-devlog finding has no fixAction');
  const { filePath, detail } = finding.fixAction;
  const { targetBytes, projectName } = parseArchiveDevlogDetail(detail);
  const checkoutPath = dirname(filePath);
  const { maxBytes } = await readDevlogLimits(config);
  const result = await archiveDevlog({ checkoutPath, maxBytes, targetBytes, projectName, today, dryRun: false });
  if (result.status !== 'archived') return null;
  return {
    rule: finding.rule,
    action: ARCHIVE_DEVLOG_ACTION,
    filePath,
    additionalPaths: result.archives.map((a) => join(checkoutPath, a.relPath)),
    before: `${result.beforeBytes} bytes`,
    after: `${result.afterBytes} bytes`,
  };
}
