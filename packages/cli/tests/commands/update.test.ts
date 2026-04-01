import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { compareSemver, fetchLatestVersion, detectInstallMethod } from '../../src/commands/update.js';

describe('compareSemver', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });

  it('returns 0 for equal versions with zeros', () => {
    expect(compareSemver('0.0.0', '0.0.0')).toBe(0);
  });

  it('returns -1 when a < b (major)', () => {
    expect(compareSemver('0.9.99', '1.0.0')).toBe(-1);
  });

  it('returns 1 when a > b (major)', () => {
    expect(compareSemver('2.0.0', '1.9.9')).toBe(1);
  });

  it('returns -1 when a < b (minor)', () => {
    expect(compareSemver('0.6.34', '0.7.0')).toBe(-1);
  });

  it('returns 1 when a > b (minor)', () => {
    expect(compareSemver('0.7.0', '0.6.34')).toBe(1);
  });

  it('returns -1 when a < b (patch)', () => {
    expect(compareSemver('1.0.0', '1.0.1')).toBe(-1);
  });

  it('returns 1 when a > b (patch)', () => {
    expect(compareSemver('1.0.2', '1.0.1')).toBe(1);
  });

  it('handles large version numbers', () => {
    expect(compareSemver('10.20.30', '10.20.29')).toBe(1);
    expect(compareSemver('10.20.30', '10.20.31')).toBe(-1);
  });
});

describe('fetchLatestVersion', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns version string on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '1.2.3', name: '@context-forge/cli' }),
    });

    const result = await fetchLatestVersion('@context-forge/cli');
    expect(result).toBe('1.2.3');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://registry.npmjs.org/@context-forge/cli/latest',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('returns null on non-200 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await fetchLatestVersion('nonexistent-package');
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'));

    const result = await fetchLatestVersion('@context-forge/cli');
    expect(result).toBeNull();
  });

  it('returns null on malformed JSON (missing version field)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ name: '@context-forge/cli' }),
    });

    const result = await fetchLatestVersion('@context-forge/cli');
    expect(result).toBeNull();
  });

  it('returns null when version field is not a string', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: 123 }),
    });

    const result = await fetchLatestVersion('@context-forge/cli');
    expect(result).toBeNull();
  });
});

describe('detectInstallMethod', () => {
  let originalArgv: string[];

  beforeEach(() => {
    originalArgv = process.argv;
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('detects npm global install', () => {
    process.argv = ['node', '/usr/local/lib/node_modules/@context-forge/cli/dist/index.js'];
    const result = detectInstallMethod();
    expect(result).toEqual({ method: 'npm', isLocal: false });
  });

  it('detects pnpm global install via .pnpm path', () => {
    process.argv = ['node', '/home/user/.local/share/pnpm/global/5/.pnpm/@context-forge+cli@0.6.34/node_modules/@context-forge/cli/dist/index.js'];
    const result = detectInstallMethod();
    expect(result).toEqual({ method: 'pnpm', isLocal: false });
  });

  it('detects pnpm global install via pnpm/global path', () => {
    process.argv = ['node', '/Users/user/Library/pnpm/global/5/node_modules/@context-forge/cli/dist/index.js'];
    const result = detectInstallMethod();
    expect(result).toEqual({ method: 'pnpm', isLocal: false });
  });

  it('detects local dev install (node_modules in project)', () => {
    process.argv = ['node', '/Users/user/projects/context-forge/node_modules/.bin/cf'];
    const result = detectInstallMethod();
    expect(result).toEqual({ method: 'unknown', isLocal: true });
  });

  it('detects local dev install for relative paths (direct node invocation)', () => {
    process.argv = ['node', 'packages/cli/dist/index.js'];
    const result = detectInstallMethod();
    expect(result).toEqual({ method: 'unknown', isLocal: true });
  });

  it('returns npm as default for unknown absolute paths', () => {
    process.argv = ['node', '/some/other/path/cf'];
    const result = detectInstallMethod();
    expect(result).toEqual({ method: 'npm', isLocal: false });
  });
});
