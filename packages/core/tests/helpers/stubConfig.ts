import { vi } from 'vitest';
import type { ConfigManager, ConfigResult } from '../../src/config/ConfigManager.js';

/**
 * Creates a stub ConfigManager whose get(key) resolves to the given values,
 * throwing if a test requests a key it didn't declare — catches tests that
 * silently rely on an unstubbed key rather than asserting its exact reads.
 */
export function makeStubConfig(values: Record<string, unknown>): ConfigManager {
  return {
    get: vi.fn(async (key: string): Promise<ConfigResult> => {
      if (!(key in values)) {
        throw new Error(`Unexpected config key requested in test: "${key}"`);
      }
      return {
        key,
        value: values[key] as string | boolean | number,
        source: 'default',
        description: '',
      };
    }),
  } as unknown as ConfigManager;
}
