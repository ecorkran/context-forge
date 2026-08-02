import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'fs/promises';
import { existsSync, renameSync as realRenameSync, mkdirSync as realMkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import envPaths from 'env-paths';
import {
  resolveStoragePath,
  getLegacyPreferencesPath,
  type StoragePathDeps,
} from '../../src/storage/storagePaths.js';

const expectedNonDarwinPath = envPaths('context-forge', { suffix: '' }).config;

describe('storagePaths', () => {
  let tempHome: string;
  let originalEnv: string | undefined;

  beforeEach(async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    tempHome = await mkdtemp(join(tmpdir(), 'cf-storage-paths-test-'));
    originalEnv = process.env.CONTEXT_FORGE_DATA_DIR;
    delete process.env.CONTEXT_FORGE_DATA_DIR;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (originalEnv === undefined) {
      delete process.env.CONTEXT_FORGE_DATA_DIR;
    } else {
      process.env.CONTEXT_FORGE_DATA_DIR = originalEnv;
    }
    await rm(tempHome, { recursive: true, force: true });
  });

  function darwinDeps(overrides: Partial<StoragePathDeps> = {}): StoragePathDeps {
    return {
      platform: 'darwin',
      homedir: () => tempHome,
      existsSync,
      mkdirSync: (path: string) => realMkdirSync(path, { recursive: true }),
      renameSync: realRenameSync,
      ...overrides,
    };
  }

  it('case 1: fresh darwin install returns the new path and creates nothing', () => {
    const deps = darwinDeps();
    const newPath = join(tempHome, '.config', 'context-forge');
    const legacyPath = getLegacyPreferencesPath(deps);

    const result = resolveStoragePath(deps);

    expect(result).toBe(newPath);
    expect(existsSync(legacyPath)).toBe(false);
  });

  it('case 2: existing install migrates projects.json and config.toml together', async () => {
    const deps = darwinDeps();
    const legacyPath = getLegacyPreferencesPath(deps);
    const newPath = join(tempHome, '.config', 'context-forge');

    await mkdir(legacyPath, { recursive: true });
    await writeFile(join(legacyPath, 'projects.json'), '[{"id":"p1"}]');
    await writeFile(join(legacyPath, 'config.toml'), '[workflow]\nauto_fix = true\n');

    const result = resolveStoragePath(deps);

    expect(result).toBe(newPath);
    expect(existsSync(legacyPath)).toBe(false);
    await expect(readFile(join(newPath, 'projects.json'), 'utf-8')).resolves.toBe(
      '[{"id":"p1"}]'
    );
    await expect(readFile(join(newPath, 'config.toml'), 'utf-8')).resolves.toBe(
      '[workflow]\nauto_fix = true\n'
    );
  });

  it('case 3: second call does not attempt another migration', async () => {
    let renameCalls = 0;
    const countingRename = (oldPath: string, newPath: string) => {
      renameCalls += 1;
      realRenameSync(oldPath, newPath);
    };
    const deps = darwinDeps({ renameSync: countingRename });
    const legacyPath = getLegacyPreferencesPath(deps);

    await mkdir(legacyPath, { recursive: true });
    await writeFile(join(legacyPath, 'projects.json'), '[]');

    const first = resolveStoragePath(deps);
    const second = resolveStoragePath(deps);

    expect(renameCalls).toBe(1);
    expect(second).toBe(first);
  });

  it('case 4: new location already exists — legacy data is left untouched', async () => {
    let renameCalls = 0;
    const countingRename = (oldPath: string, newPath: string) => {
      renameCalls += 1;
      realRenameSync(oldPath, newPath);
    };
    const deps = darwinDeps({ renameSync: countingRename });
    const legacyPath = getLegacyPreferencesPath(deps);
    const newPath = join(tempHome, '.config', 'context-forge');

    await mkdir(newPath, { recursive: true });
    await mkdir(legacyPath, { recursive: true });
    await writeFile(join(legacyPath, 'projects.json'), '[{"id":"real-data"}]');

    const result = resolveStoragePath(deps);

    expect(result).toBe(newPath);
    expect(renameCalls).toBe(0);
    await expect(readFile(join(legacyPath, 'projects.json'), 'utf-8')).resolves.toBe(
      '[{"id":"real-data"}]'
    );
  });

  it('case 5: CONTEXT_FORGE_DATA_DIR override bypasses migration entirely', async () => {
    const overridePath = join(tempHome, 'custom-override');
    process.env.CONTEXT_FORGE_DATA_DIR = overridePath;

    let renameCalls = 0;
    const countingRename = (oldPath: string, newPath: string) => {
      renameCalls += 1;
      realRenameSync(oldPath, newPath);
    };
    const deps = darwinDeps({ renameSync: countingRename });
    const legacyPath = getLegacyPreferencesPath(deps);

    await mkdir(legacyPath, { recursive: true });
    await writeFile(join(legacyPath, 'projects.json'), '[]');

    const result = resolveStoragePath(deps);

    expect(result).toBe(overridePath);
    expect(renameCalls).toBe(0);
    expect(existsSync(legacyPath)).toBe(true);
  });

  it('case 6: linux is unaffected', () => {
    const deps = darwinDeps({ platform: 'linux' });
    expect(resolveStoragePath(deps)).toBe(expectedNonDarwinPath);
  });

  it('case 7: windows is unaffected', () => {
    const deps = darwinDeps({ platform: 'win32' });
    expect(resolveStoragePath(deps)).toBe(expectedNonDarwinPath);
  });

  it('case 8: a failed migration logs a warning and returns normally', async () => {
    const throwingRename = () => {
      throw new Error('simulated EACCES');
    };
    const deps = darwinDeps({ renameSync: throwingRename });
    const legacyPath = getLegacyPreferencesPath(deps);
    const newPath = join(tempHome, '.config', 'context-forge');

    await mkdir(legacyPath, { recursive: true });
    await writeFile(join(legacyPath, 'projects.json'), '[]');

    const result = resolveStoragePath(deps);

    expect(result).toBe(newPath);
    expect(console.error).toHaveBeenCalled();
    // Source must be left intact — a failed rename must not lose data.
    expect(existsSync(legacyPath)).toBe(true);
  });
});
