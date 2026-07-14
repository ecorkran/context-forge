import { vi } from 'vitest';
import type { ConfigManager, ConfigResult } from '../../src/config/ConfigManager.js';

/** Per-key raw shared/personal file contents, for stubbing getRawProjectFileValues(). */
export type StubRawProjectFileValues = Record<
  string,
  { personal?: string | boolean | number; shared?: string | boolean | number }
>;

/**
 * Creates a stub ConfigManager whose get(key) resolves to the given values,
 * throwing if a test requests a key it didn't declare — catches tests that
 * silently rely on an unstubbed key rather than asserting its exact reads.
 *
 * `rawProjectFileValues` optionally stubs getRawProjectFileValues(key) for rules
 * (e.g. personal-config-in-shared-file) that need to distinguish per-file contents
 * rather than the precedence-merged get() result. Keys not present resolve to
 * { personal: undefined, shared: undefined } rather than throwing, since most
 * tests exercising get()-only rules don't care about this method.
 */
export function makeStubConfig(
  values: Record<string, unknown>,
  rawProjectFileValues: StubRawProjectFileValues = {}
): ConfigManager {
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
    getRawProjectFileValues: vi.fn(async (key: string) => {
      const entry = rawProjectFileValues[key];
      return { personal: entry?.personal, shared: entry?.shared };
    }),
  } as unknown as ConfigManager;
}
