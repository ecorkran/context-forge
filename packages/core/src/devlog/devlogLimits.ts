/** The devlog size limits and the one place their pair rule is enforced (slice 936, D1). */
import { CONFIG_KEYS } from '../config/ConfigKeys.js';
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

/** Read both keys without the pair rule; each value is checked against its key's own validator. */
export async function readRawDevlogLimits(config: ConfigManager): Promise<DevlogLimits> {
  const read = async (key: string): Promise<number> => {
    const { value } = await config.get(key);
    const problem = CONFIG_KEYS[key].validate?.(value);
    if (problem) throw new Error(`Config key "${key}" validation failed: ${problem}`);
    return Number(value);
  };
  return { maxBytes: await read(DEVLOG_MAX_BYTES_KEY), targetBytes: await read(DEVLOG_TARGET_BYTES_KEY) };
}

/** Read both keys and enforce the pair rule. */
export async function readDevlogLimits(config: ConfigManager): Promise<DevlogLimits> {
  const limits = await readRawDevlogLimits(config);
  assertDevlogLimits(limits.maxBytes, limits.targetBytes);
  return limits;
}
