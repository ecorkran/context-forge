import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  ADOPTION_STATES,
  AdoptionError,
  readAdoptionState,
  writeAdoptionState,
} from '../../src/adoption/index.js';

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

  it('reads empty when there is no .context-forge.toml', async () => {
    expect(await readAdoptionState(projectDir)).toBe('');
  });

  it.each(ADOPTION_STATES)('round-trips %j', async (state) => {
    await writeAdoptionState(projectDir, state);
    expect(await readAdoptionState(projectDir)).toBe(state);
  });

  it('writes an [adoption] table with the state', async () => {
    await writeAdoptionState(projectDir, 'in_progress');
    const toml = await readFile(join(projectDir, '.context-forge.toml'), 'utf-8');
    expect(toml).toContain('[adoption]');
    expect(toml).toContain('state = "in_progress"');
  });

  it('throws AdoptionError naming the value, the allowed values and the file for a hand-edited value', async () => {
    await writeFile(join(projectDir, '.context-forge.toml'), '[adoption]\nstate = "maybe"\n');
    const attempt = readAdoptionState(projectDir);
    await expect(attempt).rejects.toBeInstanceOf(AdoptionError);
    await expect(attempt).rejects.toThrow(/"maybe"/);
    await expect(attempt).rejects.toThrow(/in_progress/);
    await expect(attempt).rejects.toThrow(/\.context-forge\.toml/);
  });

  it('propagates the parser error, not AdoptionError, for malformed TOML', async () => {
    await writeFile(join(projectDir, '.context-forge.toml'), '[adoption\nstate = ');
    const attempt = readAdoptionState(projectDir);
    await expect(attempt).rejects.toThrow();
    await expect(attempt).rejects.not.toBeInstanceOf(AdoptionError);
  });
});
