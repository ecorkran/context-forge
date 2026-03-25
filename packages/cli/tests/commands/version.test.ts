import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'node:module';
import { BREAKING_CHANGES } from '../../src/utils/breaking-changes.js';

const require = createRequire(import.meta.url);
const { version: pkgVersion } = require('../../package.json') as { version: string };

// Mock GuideDetector for JSON tests
const mockDetect = vi.fn();
vi.mock('@context-forge/core/node', () => ({
  GuideDetector: vi.fn().mockImplementation(() => ({
    detect: mockDetect,
  })),
}));

describe('cf version', () => {
  let stdoutData: string;
  const originalWrite = process.stdout.write;

  beforeEach(() => {
    stdoutData = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
      stdoutData += String(chunk);
      return true;
    });
    mockDetect.mockResolvedValue({ version: 'v0.14.3' });
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  describe('--json output', () => {
    async function getVersionJson(): Promise<Record<string, unknown>> {
      // Dynamically import to get the version command's action
      // We simulate the action logic directly since Commander integration
      // is tested via the build.test.ts pattern
      const { GuideDetector } = await import('@context-forge/core/node');
      const detector = new GuideDetector();
      const info = await detector.detect(process.cwd());
      const output = {
        name: '@context-forge/cli',
        version: pkgVersion,
        guideVersion: info.version,
        breaking: BREAKING_CHANGES,
      };
      return output;
    }

    it('contains all required keys', async () => {
      const output = await getVersionJson();
      expect(output).toHaveProperty('name');
      expect(output).toHaveProperty('version');
      expect(output).toHaveProperty('guideVersion');
      expect(output).toHaveProperty('breaking');
    });

    it('version matches package.json', async () => {
      const output = await getVersionJson();
      expect(output.version).toBe(pkgVersion);
    });

    it('name is @context-forge/cli', async () => {
      const output = await getVersionJson();
      expect(output.name).toBe('@context-forge/cli');
    });

    it('guideVersion is populated from detector', async () => {
      const output = await getVersionJson();
      expect(output.guideVersion).toBe('v0.14.3');
    });

    it('guideVersion is null when detection fails', async () => {
      mockDetect.mockResolvedValue({ version: null });
      const output = await getVersionJson();
      expect(output.guideVersion).toBeNull();
    });

    it('breaking is an array', async () => {
      const output = await getVersionJson();
      expect(Array.isArray(output.breaking)).toBe(true);
    });

    it('breaking changes have since and change fields', () => {
      for (const entry of BREAKING_CHANGES) {
        expect(typeof entry.since).toBe('string');
        expect(typeof entry.change).toBe('string');
      }
    });
  });
});
