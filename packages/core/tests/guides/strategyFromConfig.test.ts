import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { GuideManager } from '../../src/guides/GuideManager.js';
import { ConfigManager } from '../../src/config/ConfigManager.js';

// Only the install strategies are stubbed. ConfigManager, the TOML parse, and
// GuideManager's resolution path are all real, so this exercises the
// config-file-to-deprecation-report wiring end to end (review finding F002).
const { mockTarballInstall, mockSubmoduleInstall } = vi.hoisted(() => ({
  mockTarballInstall: vi.fn(),
  mockSubmoduleInstall: vi.fn(),
}));

vi.mock('../../src/guides/strategies/TarballStrategy.js', () => ({
  TarballStrategy: vi.fn().mockImplementation(() => ({ install: mockTarballInstall })),
}));

vi.mock('../../src/guides/strategies/SubmoduleStrategy.js', () => ({
  SubmoduleStrategy: vi.fn().mockImplementation(() => ({ install: mockSubmoduleInstall })),
}));

vi.mock('../../src/guides/GuideDetector.js', () => ({
  GuideDetector: vi.fn().mockImplementation(() => ({
    detect: vi.fn().mockResolvedValue({ installed: false, method: null }),
  })),
}));

describe('strategy resolved from a real config file (F002)', () => {
  let projectPath: string;

  const installedByTarball = {
    success: true,
    version: 'v0.13.2',
    method: 'tarball' as const,
    path: 'project-documents/ai-project-guide',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    projectPath = mkdtempSync(join(tmpdir(), 'cf-strategy-config-'));
    mockTarballInstall.mockResolvedValue(installedByTarball);
    mockSubmoduleInstall.mockResolvedValue({ ...installedByTarball, method: 'submodule' });
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
  });

  function writeProjectConfig(body: string): void {
    writeFileSync(join(projectPath, '.context-forge.toml'), body, 'utf-8');
  }

  it('installs via tarball and reports the alias for guide.git_strategy = "manual"', async () => {
    writeProjectConfig('[guide]\ngit_strategy = "manual"\n');

    const manager = new GuideManager(projectPath, new ConfigManager(projectPath));
    const result = await manager.install();

    expect(mockTarballInstall).toHaveBeenCalled();
    expect(mockSubmoduleInstall).not.toHaveBeenCalled();
    expect(result.method).toBe('tarball');
    expect(result.deprecatedAlias).toBe('manual');
  });

  it('installs via tarball with no alias reported for guide.git_strategy = "tarball"', async () => {
    writeProjectConfig('[guide]\ngit_strategy = "tarball"\n');

    const manager = new GuideManager(projectPath, new ConfigManager(projectPath));
    const result = await manager.install();

    expect(mockTarballInstall).toHaveBeenCalled();
    expect(result.deprecatedAlias).toBeUndefined();
  });

  it('rejects an unknown strategy in the config file, naming the value', async () => {
    writeProjectConfig('[guide]\ngit_strategy = "symlink"\n');

    const manager = new GuideManager(projectPath, new ConfigManager(projectPath));

    await expect(manager.install()).rejects.toThrow(/Invalid guide strategy 'symlink'/);
    expect(mockTarballInstall).not.toHaveBeenCalled();
    expect(mockSubmoduleInstall).not.toHaveBeenCalled();
  });

  it('fails rather than silently installing when the config file is malformed (D7)', async () => {
    writeProjectConfig('[guide\ngit_strategy = "tarball"\n');

    const manager = new GuideManager(projectPath, new ConfigManager(projectPath));

    await expect(manager.install()).rejects.toThrow();
    expect(mockTarballInstall).not.toHaveBeenCalled();
    expect(mockSubmoduleInstall).not.toHaveBeenCalled();
  });

  it('lets an explicit override win over the config value', async () => {
    writeProjectConfig('[guide]\ngit_strategy = "manual"\n');

    const manager = new GuideManager(projectPath, new ConfigManager(projectPath));
    const result = await manager.install('submodule');

    expect(mockSubmoduleInstall).toHaveBeenCalled();
    expect(mockTarballInstall).not.toHaveBeenCalled();
    expect(result.deprecatedAlias).toBeUndefined();
  });
});
