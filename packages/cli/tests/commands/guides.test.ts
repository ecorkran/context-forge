import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import {
  registerGuidesCommand,
  guidesInstallAction,
  strategyHelpText,
  GUIDE_STRATEGIES,
} from '../../src/commands/guides.js';
import { CHECKOUT_STATE_LABELS, GUIDE_MANAGED_NOTICE } from '@context-forge/core';

const {
  mockGetAll,
  mockGetById,
  mockStatus,
  mockInstall,
  mockUpdate,
  MockGuideManager,
  mockResolveProjectWorktree,
  mockAskConfirmation,
} = vi.hoisted(() => ({
  mockGetAll: vi.fn(),
  mockGetById: vi.fn(),
  mockStatus: vi.fn(),
  mockInstall: vi.fn(),
  mockUpdate: vi.fn(),
  MockGuideManager: vi.fn(),
  mockResolveProjectWorktree: vi.fn(),
  mockAskConfirmation: vi.fn(),
}));

// Real BranchGuardBlockedError/BranchGuardWarnError (via importActual) so `instanceof`
// checks in guides.ts behave correctly, while the rest of the barrel stays mocked.
vi.mock('@context-forge/core/node', async () => {
  const actual = await vi.importActual<typeof import('@context-forge/core/node')>(
    '@context-forge/core/node'
  );
  return {
    FileProjectStore: vi.fn().mockImplementation(() => ({
      getAll: mockGetAll,
      getById: mockGetById,
    })),
    GuideManager: MockGuideManager,
    ConfigManager: vi.fn().mockImplementation(() => ({
      get: vi.fn().mockResolvedValue({ value: '' }),
    })),
    BranchGuardBlockedError: actual.BranchGuardBlockedError,
    BranchGuardWarnError: actual.BranchGuardWarnError,
  };
});

import { BranchGuardBlockedError, BranchGuardWarnError } from '@context-forge/core/node';

vi.mock('../../src/utils/project.js', () => ({
  resolveProjectWorktree: (...args: unknown[]) => mockResolveProjectWorktree(...args),
}));

vi.mock('../../src/utils/confirm.js', () => ({
  askConfirmation: (...args: unknown[]) => mockAskConfirmation(...args),
}));

const sampleProject = {
  id: 'proj_001',
  name: 'test-project',
  projectPath: '/tmp/test',
};

const sampleProjectWithWorktrees = {
  ...sampleProject,
  worktrees: [
    { id: 'wt_1', name: 'default', worktreePath: '/tmp/test', indexRange: [100, 299] },
    { id: 'wt_2', name: 'world-server', worktreePath: '/tmp/test-ws', indexRange: [300, 499] },
  ],
};

const sampleGuideInfo = {
  installed: true,
  method: 'submodule',
  version: 'v0.13.2',
  path: '/tmp/test/project-documents/ai-project-guide',
  source: 'https://github.com/ecorkran/ai-project-guide.git',
  latestVersion: 'v0.13.2',
  updateAvailable: false,
  usingBundledPrompt: false,
};

const notInstalledInfo = {
  installed: false,
  method: null,
  version: null,
  path: '/tmp/test/project-documents/ai-project-guide',
  source: 'https://github.com/ecorkran/ai-project-guide.git',
  latestVersion: 'v0.13.2',
  updateAvailable: false,
  usingBundledPrompt: true,
};

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerGuidesCommand(program);
  return program;
}

describe('cf guides', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveProjectWorktree.mockResolvedValue({ id: 'proj_001', source: 'flag' });
    mockGetAll.mockResolvedValue([sampleProject]);
    mockGetById.mockResolvedValue(sampleProject);
    MockGuideManager.mockImplementation(() => ({
      status: mockStatus,
      install: mockInstall,
      update: mockUpdate,
    }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('displays status info in formatted output', async () => {
    mockStatus.mockResolvedValue(sampleGuideInfo);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('yes');
    expect(output).toContain('submodule');
    expect(output).toContain('v0.13.2');
  });

  it('outputs GuideInfo as JSON with --json flag', async () => {
    mockStatus.mockResolvedValue(sampleGuideInfo);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', '--json', '--project', 'proj_001']);

    const raw = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.installed).toBe(true);
    expect(parsed.method).toBe('submodule');
  });

  it('shows not-installed status with install guidance', async () => {
    mockStatus.mockResolvedValue(notInstalledInfo);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('no');
    expect(output).toContain('not installed');
  });
});

describe('cf guides install', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveProjectWorktree.mockResolvedValue({ id: 'proj_001', source: 'flag' });
    mockGetAll.mockResolvedValue([sampleProject]);
    mockGetById.mockResolvedValue(sampleProject);
    MockGuideManager.mockImplementation(() => ({
      status: mockStatus,
      install: mockInstall,
      update: mockUpdate,
    }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('calls install with default strategy', async () => {
    mockInstall.mockResolvedValue({
      success: true, version: 'v0.13.2', method: 'submodule', path: '/tmp/test/project-documents/ai-project-guide',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'install', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('installed successfully');
    expect(output).toContain('v0.13.2');
  });

  it('passes strategy override with --strategy clone', async () => {
    mockInstall.mockResolvedValue({
      success: true, version: 'v0.13.2', method: 'clone', path: '/tmp/test/project-documents/ai-project-guide',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'install', '--strategy', 'clone', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('clone');
  });

  it('shows error guidance when already installed', async () => {
    mockInstall.mockRejectedValue(new Error('Guide is already installed. Use guide_update (or cf guides update) to update it.'));

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'install', '--project', 'proj_001']);

    const output = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('already installed');
  });
});

describe('cf guides install — deprecated strategy alias (D5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveProjectWorktree.mockResolvedValue({ id: 'proj_001', source: 'flag' });
    mockGetAll.mockResolvedValue([sampleProject]);
    mockGetById.mockResolvedValue(sampleProject);
    MockGuideManager.mockImplementation(() => ({
      status: mockStatus,
      install: mockInstall,
      update: mockUpdate,
    }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('passes the raw --strategy string through to the manager for normalization', async () => {
    mockInstall.mockResolvedValue({
      success: true, version: 'v0.13.2', method: 'tarball',
      path: '/tmp/test/project-documents/ai-project-guide', deprecatedAlias: 'manual',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'install', '--strategy', 'manual', '--project', 'proj_001']);

    expect(mockInstall).toHaveBeenCalledWith('manual', undefined);
  });

  it('reports the canonical method on stdout for an alias install', async () => {
    mockInstall.mockResolvedValue({
      success: true, version: 'v0.13.2', method: 'tarball',
      path: '/tmp/test/project-documents/ai-project-guide', deprecatedAlias: 'manual',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'install', '--strategy', 'manual', '--project', 'proj_001']);

    const stdout = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(stdout).toContain('tarball');
    expect(stdout).not.toContain('deprecated');
  });

  it('prints the deprecation warning to stderr only (D4)', async () => {
    mockInstall.mockResolvedValue({
      success: true, version: 'v0.13.2', method: 'tarball',
      path: '/tmp/test/project-documents/ai-project-guide', deprecatedAlias: 'manual',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'install', '--strategy', 'manual', '--project', 'proj_001']);

    const stderr = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(stderr).toContain('deprecated');
    expect(stderr).toContain('tarball');
  });

  it('prints no deprecation warning for a canonical strategy', async () => {
    mockInstall.mockResolvedValue({
      success: true, version: 'v0.13.2', method: 'tarball',
      path: '/tmp/test/project-documents/ai-project-guide',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'install', '--strategy', 'tarball', '--project', 'proj_001']);

    const stderr = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(stderr).not.toContain('deprecated');
  });

  it('warns identically when the alias came from config rather than the flag (F002)', async () => {
    // No --strategy flag: the alias reaches the CLI only via the manager's
    // config-sourced result, which is the path review finding F002 called out.
    mockInstall.mockResolvedValue({
      success: true, version: 'v0.13.2', method: 'tarball',
      path: '/tmp/test/project-documents/ai-project-guide', deprecatedAlias: 'manual',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'install', '--project', 'proj_001']);

    expect(mockInstall).toHaveBeenCalledWith(undefined, undefined);
    const stderr = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(stderr).toContain('deprecated');
    const stdout = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(stdout).toContain('tarball');
  });
});

describe('guidesInstallAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('prints version and method on successful install', async () => {
    mockInstall.mockResolvedValue({
      success: true, version: 'v0.13.2', method: 'submodule', path: '/tmp/test/project-documents/ai-project-guide',
    });

    await guidesInstallAction('/tmp/test');

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('installed successfully');
    expect(output).toContain('v0.13.2');
    expect(output).toContain('submodule');
  });

  it('propagates errors thrown by manager.install', async () => {
    mockInstall.mockRejectedValue(new Error('Guide is already installed.'));

    await expect(guidesInstallAction('/tmp/test')).rejects.toThrow('Guide is already installed.');
  });
});

describe('cf guides update', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveProjectWorktree.mockResolvedValue({ id: 'proj_001', source: 'flag' });
    mockGetAll.mockResolvedValue([sampleProject]);
    mockGetById.mockResolvedValue(sampleProject);
    MockGuideManager.mockImplementation(() => ({
      status: mockStatus,
      install: mockInstall,
      update: mockUpdate,
    }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('calls update and displays version change', async () => {
    mockUpdate.mockResolvedValue({
      success: true, previousVersion: 'v0.12.0', newVersion: 'v0.13.2', method: 'submodule',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'update', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('updated successfully');
    expect(output).toContain('v0.12.0');
    expect(output).toContain('v0.13.2');
  });

  it('shows error guidance when not installed', async () => {
    mockUpdate.mockRejectedValue(new Error('Guide is not installed. Use guide_install (or cf guides install) to install it first.'));

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'update', '--project', 'proj_001']);

    const output = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('not installed');
  });

  it('shows informational message when already at latest', async () => {
    mockUpdate.mockResolvedValue({
      success: true, previousVersion: 'v0.13.2', newVersion: 'v0.13.2', method: 'submodule',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'update', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('already at the latest');
    // No worktree sync happened, so the sync-acknowledging message must not appear
    expect(output).not.toContain('worktree synced');
  });

  it('acknowledges worktree sync when already at latest but worktree was synced (GH #44)', async () => {
    mockUpdate.mockResolvedValue({
      success: true, previousVersion: 'v0.13.2', newVersion: 'v0.13.2', method: 'submodule',
      worktreeSynced: true,
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'update', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('worktree synced');
    expect(output).toContain('v0.13.2');
  });

  it('BranchGuardBlockedError: exits non-zero, error message printed, no retry attempted', async () => {
    mockUpdate.mockRejectedValue(new BranchGuardBlockedError('dev/erik', 'main'));

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'update', '--project', 'proj_001']);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(process.exit).toHaveBeenCalledWith(1);
    const output = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('dev/erik');
    expect(output).toContain('main');
  });

  it('BranchGuardWarnError with --yes: retries with confirmed: true, success path reached, no prompt', async () => {
    mockUpdate
      .mockRejectedValueOnce(new BranchGuardWarnError('main', 'feature-x', 'descends'))
      .mockResolvedValueOnce({
        success: true, previousVersion: 'v0.12.0', newVersion: 'v0.13.2', method: 'submodule',
      });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'update', '--project', 'proj_001', '--yes']);

    expect(mockUpdate).toHaveBeenNthCalledWith(2, { confirmed: true });
    expect(mockAskConfirmation).not.toHaveBeenCalled();
    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('updated successfully');
  });

  it('BranchGuardWarnError, no --yes, confirmation true: retries with confirmed: true', async () => {
    mockAskConfirmation.mockResolvedValue(true);
    mockUpdate
      .mockRejectedValueOnce(new BranchGuardWarnError('main', 'feature-x', 'descends'))
      .mockResolvedValueOnce({
        success: true, previousVersion: 'v0.12.0', newVersion: 'v0.13.2', method: 'submodule',
      });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'update', '--project', 'proj_001']);

    expect(mockAskConfirmation).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenNthCalledWith(2, { confirmed: true });
    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('updated successfully');
  });

  it('BranchGuardWarnError, no --yes, confirmation false: update NOT retried, exits without error', async () => {
    mockAskConfirmation.mockResolvedValue(false);
    mockUpdate.mockRejectedValueOnce(new BranchGuardWarnError('main', 'feature-x', 'descends'));

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'update', '--project', 'proj_001']);

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(process.exit).not.toHaveBeenCalled();
    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('cancelled');
  });
});

describe('worktree-aware guide operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MockGuideManager.mockImplementation(() => ({
      status: mockStatus,
      install: mockInstall,
      update: mockUpdate,
    }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('cf guides info passes operationPath when resolved to a worktree', async () => {
    mockResolveProjectWorktree.mockResolvedValue({ id: 'proj_001', worktreeId: 'wt_2', source: 'worktree' });
    mockGetById.mockResolvedValue(sampleProjectWithWorktrees);
    mockStatus.mockResolvedValue(sampleGuideInfo);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides']);

    expect(MockGuideManager).toHaveBeenCalledWith('/tmp/test', expect.anything(), '/tmp/test-ws');
  });

  it('cf guides update passes operationPath when resolved to a worktree', async () => {
    mockResolveProjectWorktree.mockResolvedValue({ id: 'proj_001', worktreeId: 'wt_2', source: 'worktree' });
    mockGetById.mockResolvedValue(sampleProjectWithWorktrees);
    mockUpdate.mockResolvedValue({
      success: true, previousVersion: 'v0.12.0', newVersion: 'v0.13.2', method: 'submodule',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'update']);

    expect(MockGuideManager).toHaveBeenCalledWith('/tmp/test', expect.anything(), '/tmp/test-ws');
  });

  it('cf guides install does NOT pass operationPath', async () => {
    mockResolveProjectWorktree.mockResolvedValue({ id: 'proj_001', worktreeId: 'wt_2', source: 'worktree' });
    mockGetById.mockResolvedValue(sampleProjectWithWorktrees);
    mockInstall.mockResolvedValue({
      success: true, version: 'v0.13.2', method: 'submodule', path: '/tmp/test/project-documents/ai-project-guide',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'install']);

    // Install always uses projectPath only (no operationPath)
    expect(MockGuideManager).toHaveBeenCalledWith('/tmp/test', expect.anything());
  });

  it('operationPath equals projectPath when no worktree resolved', async () => {
    mockResolveProjectWorktree.mockResolvedValue({ id: 'proj_001', source: 'flag' });
    mockGetById.mockResolvedValue(sampleProject);
    mockStatus.mockResolvedValue(sampleGuideInfo);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', '--project', 'proj_001']);

    // operationPath defaults to projectPath when no worktreeId
    expect(MockGuideManager).toHaveBeenCalledWith('/tmp/test', expect.anything(), '/tmp/test');
  });
});

describe('cf guides info — checkout state and managed notice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveProjectWorktree.mockResolvedValue({ id: 'proj_001', source: 'flag' });
    mockGetAll.mockResolvedValue([sampleProject]);
    mockGetById.mockResolvedValue(sampleProject);
    MockGuideManager.mockImplementation(() => ({
      status: mockStatus,
      install: mockInstall,
      update: mockUpdate,
    }));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  const baseInfo = {
    installed: true,
    method: 'submodule',
    version: 'v0.13.2',
    path: '/tmp/test/project-documents/ai-project-guide',
    source: 'https://github.com/ecorkran/ai-project-guide.git',
    latestVersion: 'v0.13.2',
    updateAvailable: false,
    usingBundledPrompt: false,
  };

  function output(): string {
    return vi.mocked(console.log).mock.calls.map((c) => String(c[0] ?? '')).join('\n');
  }

  it('shows an uninitialized checkout using the shared label', async () => {
    mockStatus.mockResolvedValue({ ...baseInfo, checkout: 'not_initialized' });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'info', '--project', 'proj_001']);

    expect(output()).toContain('Checkout:');
    expect(output()).toContain(CHECKOUT_STATE_LABELS.not_initialized);
  });

  it('shows an out-of-sync checkout using the shared label', async () => {
    mockStatus.mockResolvedValue({ ...baseInfo, checkout: 'out_of_sync' });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'info', '--project', 'proj_001']);

    expect(output()).toContain(CHECKOUT_STATE_LABELS.out_of_sync);
  });

  it('omits the Checkout line for a tarball install', async () => {
    mockStatus.mockResolvedValue({ ...baseInfo, method: 'tarball', checkout: null });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'info', '--project', 'proj_001']);

    expect(output()).not.toContain('Checkout:');
  });

  it('states that the guide directory is managed content (#82)', async () => {
    mockStatus.mockResolvedValue({ ...baseInfo, checkout: 'in_sync' });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'info', '--project', 'proj_001']);

    expect(output()).toContain(GUIDE_MANAGED_NOTICE);
  });

  it('does not print the managed notice when no guide is installed', async () => {
    mockStatus.mockResolvedValue({
      ...baseInfo,
      installed: false,
      method: null,
      checkout: null,
      usingBundledPrompt: true,
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'guides', 'info', '--project', 'proj_001']);

    expect(output()).not.toContain(GUIDE_MANAGED_NOTICE);
  });
});

describe('strategy help text (D8)', () => {
  it('names every strategy with its trade-off', () => {
    const text = strategyHelpText();

    for (const name of Object.keys(GUIDE_STRATEGIES)) {
      expect(text).toContain(name);
    }
    for (const { summary } of Object.values(GUIDE_STRATEGIES)) {
      expect(text).toContain(summary);
    }
  });

  it('does not advertise the deprecated alias', () => {
    expect(strategyHelpText()).not.toContain('manual');
  });
});
