import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  AdoptionError,
  legacyAdoptionStateNotice,
  readAdoptionOptOut,
} from '../../src/adoption/index.js';
import { ADOPTION_OPT_OUT, LEGACY_ADOPTION_STATES } from '../../src/config/ConfigKeys.js';

const CONFIG_FILE = '.context-forge.toml';
const UNSET_COMMAND = 'cf config unset adoption.state';
const UNKNOWN_VALUE = 'maybe';
const stateToml = (value: string): string => `[adoption]\nstate = "${value}"\n`;

describe('adoption state helpers', () => {
  let dataDir: string;
  let projectDir: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'cf-adopt-state-data-'));
    projectDir = await mkdtemp(join(tmpdir(), 'cf-adopt-state-project-'));
    originalEnv = process.env.CONTEXT_FORGE_DATA_DIR;
    process.env.CONTEXT_FORGE_DATA_DIR = dataDir;
  });

  afterEach(async () => {
    if (originalEnv === undefined) {
      delete process.env.CONTEXT_FORGE_DATA_DIR;
    } else {
      process.env.CONTEXT_FORGE_DATA_DIR = originalEnv;
    }
    await rm(dataDir, { recursive: true, force: true });
    await rm(projectDir, { recursive: true, force: true });
  });

  it('propagates the parser error, not AdoptionError, for malformed TOML', async () => {
    await writeFile(join(projectDir, CONFIG_FILE), '[adoption\nstate = ');
    const attempt = readAdoptionOptOut(projectDir);
    await expect(attempt).rejects.toThrow();
    await expect(attempt).rejects.not.toBeInstanceOf(AdoptionError);
  });

  describe('readAdoptionOptOut', () => {
    it('is not opted out when there is no config file', async () => {
      expect(await readAdoptionOptOut(projectDir)).toEqual({ optedOut: false, ignoredLegacyValue: null });
    });

    it('is not opted out for an empty value', async () => {
      await writeFile(join(projectDir, CONFIG_FILE), stateToml(''));
      expect(await readAdoptionOptOut(projectDir)).toEqual({ optedOut: false, ignoredLegacyValue: null });
    });

    it('is opted out for the opt-out value', async () => {
      await writeFile(join(projectDir, CONFIG_FILE), stateToml(ADOPTION_OPT_OUT));
      expect(await readAdoptionOptOut(projectDir)).toEqual({ optedOut: true, ignoredLegacyValue: null });
    });

    it.each(LEGACY_ADOPTION_STATES)('ignores and reports the legacy value %j', async (value) => {
      await writeFile(join(projectDir, CONFIG_FILE), stateToml(value));
      expect(await readAdoptionOptOut(projectDir)).toEqual({ optedOut: false, ignoredLegacyValue: value });
    });

    it('throws AdoptionError naming the opt-out for an unknown value', async () => {
      await writeFile(join(projectDir, CONFIG_FILE), stateToml(UNKNOWN_VALUE));
      const attempt = readAdoptionOptOut(projectDir);
      await expect(attempt).rejects.toBeInstanceOf(AdoptionError);
      await expect(attempt).rejects.toThrow(`"${UNKNOWN_VALUE}"`);
      await expect(attempt).rejects.toThrow(`"${ADOPTION_OPT_OUT}"`);
    });
  });

  describe('legacyAdoptionStateNotice', () => {
    it.each(LEGACY_ADOPTION_STATES)('names %j and the unset command', (value) => {
      const notice = legacyAdoptionStateNotice(value);
      expect(notice).toContain(`"${value}"`);
      expect(notice).toContain(UNSET_COMMAND);
    });
  });
});
