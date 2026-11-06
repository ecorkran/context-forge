/** The devlog size limits and the one place their pair rule is enforced (slice 936, D1). */
import type { ConfigManager } from '../config/ConfigManager.js';

export const DEVLOG_MAX_BYTES_KEY = 'devlog.max_bytes';
export const DEVLOG_TARGET_BYTES_KEY = 'devlog.target_bytes';

export interface DevlogLimits {
  maxBytes: number;
  targetBytes: number;
}

/** Throws when the target is not strictly below the limit; the error names both keys. */
export function assertDevlogLimits(maxBytes: number, targetBytes: number): void {
  if (targetBytes >= maxBytes) {
    throw new Error(
      `${DEVLOG_TARGET_BYTES_KEY} (${targetBytes}) must be less than ${DEVLOG_MAX_BYTES_KEY} (${maxBytes})`,
    );
  }
}

/** Read both keys and enforce the pair rule. */
export async function readDevlogLimits(config: ConfigManager): Promise<DevlogLimits> {
  const max = await config.get(DEVLOG_MAX_BYTES_KEY);
  const target = await config.get(DEVLOG_TARGET_BYTES_KEY);
  const limits = { maxBytes: Number(max.value), targetBytes: Number(target.value) };
  assertDevlogLimits(limits.maxBytes, limits.targetBytes);
  return limits;
}
