import { describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { CONFIG_KEYS, ConfigScope } from '../../src/config/ConfigKeys.js';
import { ConfigManager } from '../../src/config/ConfigManager.js';
import {
  DEVLOG_MAX_BYTES_KEY,
  DEVLOG_TARGET_BYTES_KEY,
  assertDevlogLimits,
  readDevlogLimits,
} from '../../src/devlog/devlogLimits.js';

describe('devlog config keys', () => {
  it('defines both keys with shared scope and the documented defaults', () => {
    expect(CONFIG_KEYS[DEVLOG_MAX_BYTES_KEY]).toMatchObject({ default: 200000, scope: ConfigScope.Shared });
    expect(CONFIG_KEYS[DEVLOG_TARGET_BYTES_KEY]).toMatchObject({ default: 100000, scope: ConfigScope.Shared });
  });

  it.each([DEVLOG_MAX_BYTES_KEY, DEVLOG_TARGET_BYTES_KEY])('%s accepts only positive integers', (key) => {
    const validate = CONFIG_KEYS[key].validate!;
    expect(validate(1)).toBeNull();
    expect(validate(150000)).toBeNull();
    for (const bad of [0, -5, 1.5, '100', true]) expect(validate(bad)).not.toBeNull();
  });

  it('resolves defaults through ConfigManager', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'devlog-keys-'));
    try {
      expect(await readDevlogLimits(new ConfigManager(dir))).toEqual({ maxBytes: 200000, targetBytes: 100000 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('assertDevlogLimits', () => {
  it('passes when target is below max', () => {
    expect(() => assertDevlogLimits(200, 100)).not.toThrow();
  });

  it.each([
    [100, 200],
    [100, 100],
  ])('throws for max %i and target %i, naming both keys', (max, target) => {
    expect(() => assertDevlogLimits(max, target)).toThrow(
      new RegExp(`${DEVLOG_TARGET_BYTES_KEY}.*${DEVLOG_MAX_BYTES_KEY}`),
    );
  });
});
