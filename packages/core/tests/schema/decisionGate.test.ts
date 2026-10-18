import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ConfigManager } from '../../src/config/ConfigManager.js';
import { isDecisionGateEnabled, readPendingDecisions } from '../../src/schema/decisionGate.js';
import { makeStubConfig } from '../helpers/stubConfig.js';

describe('decisionGate', () => {
  let dataDir: string;
  let projectDir: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    dataDir = await mkdtemp(join(tmpdir(), 'cf-gate-data-'));
    projectDir = await mkdtemp(join(tmpdir(), 'cf-gate-project-'));
    originalEnv = process.env.CONTEXT_FORGE_DATA_DIR;
    // Isolate user-level config so the developer's own settings cannot leak in.
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

  describe('isDecisionGateEnabled', () => {
    it('is true when the key is unset', async () => {
      expect(await isDecisionGateEnabled(new ConfigManager(projectDir))).toBe(true);
    });

    it('is false when the key is set to false', async () => {
      const config = new ConfigManager(projectDir);
      await config.set('workflow.decision_gate_enabled', false, 'project');
      expect(await isDecisionGateEnabled(config)).toBe(false);
    });

    it('throws on a non-boolean value instead of treating it as off', async () => {
      const config = makeStubConfig({ 'workflow.decision_gate_enabled': 'true' });
      await expect(isDecisionGateEnabled(config)).rejects.toThrow(/must be true or false/);
    });
  });

  describe('readPendingDecisions', () => {
    it('returns the parser result for a file with a pending line', async () => {
      const path = join(projectDir, 'design.md');
      await writeFile(path, '### D1 — Example\nStatus: pending-pm\n');
      expect(await readPendingDecisions(path)).toEqual([{ heading: 'D1 — Example', line: 2 }]);
    });

    it('rejects for a nonexistent path instead of returning []', async () => {
      await expect(readPendingDecisions(join(projectDir, 'missing.md'))).rejects.toThrow();
    });
  });
});
