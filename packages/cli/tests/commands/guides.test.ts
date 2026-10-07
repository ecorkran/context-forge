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
    sameExcludeList: actual.sameExcludeList,
    GuideExcludeError: actual.GuideExcludeError,
  };
});

import { BranchGuardBlockedError, BranchGuardWarnError, GuideExcludeError } from '@context-forge/core/node';

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
  excludeApplied: [] as string[],
  excludeConfigured: [] as string[],
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
  excludeApplied: [] as string[],
  excludeConfigured: [] as string[],
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

    expect(mockInstall).toHaveBeenCalledWith('manual', undefined, { version: undefined, sourceRoot: process.cwd() });
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

    expect(mockInstall).toHaveBeenCalledWith(undefined, undefined, { version: undefined, sourceRoot: process.cwd() });
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

    expect(mockUpdate).toHaveBeenNthCalledWith(2, expect.objectContaining({ confirmed: true }));
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
    expect(mockUpdate).toHaveBeenNthCalledWith(2, expect.objectContaining({ confirmed: true }));
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

describe('cf guides --source and --version', () => {
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

  const installed = {
    success: true, version: 'local', method: 'tarball', path: '/tmp/test/project-documents/ai-project-guide',
  };
  const updated = { success: true, previousVersion: 'v0.12.0', newVersion: 'v0.2.0', method: 'tarball' };

  it('install forwards --source and --version, resolving relative paths against the cwd', async () => {
    mockInstall.mockResolvedValue({ ...installed, version: 'v0.2.0' });

    await createProgram().parseAsync([
      'node', 'cf', 'guides', 'install', '--strategy', 'tarball', '--source', './g.tgz', '--version', 'v0.2.0', '--project', 'proj_001',
    ]);

    expect(mockInstall).toHaveBeenCalledWith('tarball', './g.tgz', { version: 'v0.2.0', sourceRoot: process.cwd() });
  });

  it('install prints the resulting version', async () => {
    mockInstall.mockResolvedValue(installed);

    await createProgram().parseAsync(['node', 'cf', 'guides', 'install', '--source', './g.tgz', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('local');
  });

  it('update forwards --source and --version with the cwd as the root', async () => {
    mockUpdate.mockResolvedValue(updated);

    await createProgram().parseAsync([
      'node', 'cf', 'guides', 'update', '--source', './g.tgz', '--version', 'v0.2.0', '--project', 'proj_001',
    ]);

    expect(mockUpdate).toHaveBeenCalledWith({
      source: './g.tgz',
      version: 'v0.2.0',
      sourceRoot: process.cwd(),
      confirm: expect.any(Function),
    });
  });

  it('update keeps --source and --version on the branch-guard retry', async () => {
    mockUpdate
      .mockRejectedValueOnce(new BranchGuardWarnError('main', 'feature-x', 'descends'))
      .mockResolvedValueOnce(updated);

    await createProgram().parseAsync([
      'node', 'cf', 'guides', 'update', '--version', 'v0.2.0', '--project', 'proj_001', '--yes',
    ]);

    expect(mockUpdate).toHaveBeenNthCalledWith(2, {
      source: undefined, version: 'v0.2.0', sourceRoot: process.cwd(), confirmed: true,
    });
  });

  it('says "already at <tag>" instead of "latest" when a pinned version is already installed', async () => {
    mockUpdate.mockResolvedValue({ success: true, previousVersion: 'v0.20.1', newVersion: 'v0.20.1', method: 'tarball' });

    await createProgram().parseAsync(['node', 'cf', 'guides', 'update', '--version', 'v0.20.1', '--project', 'proj_001', '--yes']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Guide is already at v0.20.1.');
    expect(output).not.toContain('latest');
  });

  it.each([
    ['install', mockInstall],
    ['update', mockUpdate],
  ])('a tarball-only error from %s prints as a failure with a non-zero exit', async (command, mock) => {
    mock.mockRejectedValue(new Error('--version and local --source apply to tarball installs only (this guide is installed as submodule)'));

    await createProgram().parseAsync(['node', 'cf', 'guides', command, '--version', 'v0.2.0', '--project', 'proj_001']);

    expect(process.exit).toHaveBeenCalledWith(1);
    const output = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('tarball installs only');
  });
});

describe('cf guides update — preview prompt', () => {
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

  type Confirm = (
    preview: { added: number; removed: number; changed: number },
    versions: { from: string | null; to: string }
  ) => Promise<boolean>;

  const tarballUpdated = {
    success: true, previousVersion: 'v0.20.2', newVersion: 'v0.21.0', method: 'tarball',
    preview: { added: 12, removed: 3, changed: 41 },
  };

  /** An update that asks the CLI's confirm callback, as TarballStrategy does, and reports the outcome. */
  function updateThatAsks(): void {
    mockUpdate.mockImplementation(async (opts: { confirm?: Confirm }) => {
      const go = opts.confirm
        ? await opts.confirm({ added: 12, removed: 3, changed: 41 }, { from: 'v0.20.2', to: 'v0.21.0' })
        : true;
      return go
        ? tarballUpdated
        : { success: false, previousVersion: 'v0.20.2', newVersion: 'v0.20.2', method: 'tarball', cancelled: true };
    });
  }

  const logged = (): string => vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');

  it('shows the version change and counts, then asks', async () => {
    updateThatAsks();
    mockAskConfirmation.mockResolvedValue(true);

    await createProgram().parseAsync(['node', 'cf', 'guides', 'update', '--project', 'proj_001']);

    expect(logged()).toContain('Guide update: v0.20.2 → v0.21.0');
    expect(logged()).toContain('12 added, 3 removed, 41 changed');
    expect(mockAskConfirmation).toHaveBeenCalledWith('Continue? (y/N) ');
    expect(logged()).toContain('updated successfully');
  });

  it('--yes passes no confirm callback and asks nothing', async () => {
    updateThatAsks();

    await createProgram().parseAsync(['node', 'cf', 'guides', 'update', '--project', 'proj_001', '--yes']);

    expect(mockUpdate.mock.calls[0][0].confirm).toBeUndefined();
    expect(mockAskConfirmation).not.toHaveBeenCalled();
    expect(logged()).toContain('updated successfully');
  });

  it('prints the cancelled line when the user declines (also what EOF at the prompt yields)', async () => {
    updateThatAsks();
    mockAskConfirmation.mockResolvedValue(false);

    await createProgram().parseAsync(['node', 'cf', 'guides', 'update', '--project', 'proj_001']);

    expect(logged()).toContain('Update cancelled; guide unchanged.');
    expect(logged()).not.toContain('updated successfully');
    expect(process.exit).not.toHaveBeenCalled();
  });

  it('prints the up-to-date line for an unchanged result', async () => {
    mockUpdate.mockResolvedValue({
      success: true, previousVersion: 'v0.21.0', newVersion: 'v0.21.0', method: 'tarball', unchanged: true,
      preview: { added: 0, removed: 0, changed: 0 },
    });

    await createProgram().parseAsync(['node', 'cf', 'guides', 'update', '--project', 'proj_001']);

    expect(logged()).toContain('Guide is already up to date (v0.21.0).');
    expect(mockAskConfirmation).not.toHaveBeenCalled();
  });

  it('asks the branch-guard question and then the preview question', async () => {
    mockAskConfirmation.mockResolvedValue(true);
    let call = 0;
    mockUpdate.mockImplementation(async (opts: { confirm?: Confirm }) => {
      if (call++ === 0) throw new BranchGuardWarnError('main', 'feature-x', 'descends');
      await opts.confirm?.({ added: 1, removed: 0, changed: 0 }, { from: 'v0.20.2', to: 'v0.21.0' });
      return tarballUpdated;
    });

    await createProgram().parseAsync(['node', 'cf', 'guides', 'update', '--project', 'proj_001']);

    expect(mockAskConfirmation).toHaveBeenCalledTimes(2);
    // The guard question came first, before any preview was printed.
    expect(vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n')).toContain('feature-x');
    expect(logged()).toContain('Guide update: v0.20.2 → v0.21.0');
  });

  it('--yes answers the branch guard and asks no preview question', async () => {
    let call = 0;
    mockUpdate.mockImplementation(async () => {
      if (call++ === 0) throw new BranchGuardWarnError('main', 'feature-x', 'descends');
      return tarballUpdated;
    });

    await createProgram().parseAsync(['node', 'cf', 'guides', 'update', '--project', 'proj_001', '--yes']);

    expect(mockAskConfirmation).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it('reports a same-version update that changed files as an update, not "already at latest"', async () => {
    mockUpdate.mockResolvedValue({
      success: true, previousVersion: 'local', newVersion: 'local', method: 'tarball',
      preview: { added: 1, removed: 0, changed: 2 },
    });

    await createProgram().parseAsync(['node', 'cf', 'guides', 'update', '--project', 'proj_001', '--yes']);

    expect(logged()).toContain('updated successfully');
    expect(logged()).toContain('1 added, 0 removed, 2 changed');
    expect(logged()).not.toContain('already at the latest');
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
    excludeApplied: [] as string[],
    excludeConfigured: [] as string[],
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

describe('guide.exclude reporting', () => {
  const tarballPath = '/tmp/test/project-documents/ai-project-guide';

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveProjectWorktree.mockResolvedValue({ id: 'proj_001', source: 'flag' });
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

  const stdout = (): string => vi.mocked(console.log).mock.calls.map((c) => String(c[0] ?? '')).join('\n');
  const stderr = (): string => vi.mocked(console.error).mock.calls.map((c) => String(c[0] ?? '')).join('\n');

  async function run(...args: string[]): Promise<void> {
    await createProgram().parseAsync(['node', 'cf', 'guides', ...args, '--project', 'proj_001']);
  }

  it('install prints the applied list and warns about an unmatched pattern', async () => {
    mockInstall.mockResolvedValue({
      success: true, version: 'v0.19.3', method: 'tarball', path: tarballPath,
      exclude: ['tool-guide', 'tool-guides'], unmatchedExclude: ['tool-guide'],
    });

    await run('install');

    expect(stdout()).toContain('Excluded:');
    expect(stdout()).toContain('tool-guide, tool-guides');
    expect(stderr()).toContain('guide.exclude entry "tool-guide" matched nothing in v0.19.3');
  });

  it('update with excludeChanged reports the re-extract instead of "already at latest"', async () => {
    mockUpdate.mockResolvedValue({
      success: true, previousVersion: 'v0.19.3', newVersion: 'v0.19.3', method: 'tarball',
      exclude: ['framework-guides', 'tool-guides'], excludeChanged: true, committed: true,
    });

    await run('update');

    expect(stdout()).toContain('Guide re-extracted with updated excludes.');
    expect(stdout()).toContain('framework-guides, tool-guides');
    expect(stdout()).not.toContain('already at the latest');
  });

  it('update warns when the config file was left out of the guide commit', async () => {
    mockUpdate.mockResolvedValue({
      success: true, previousVersion: 'v0.19.3', newVersion: 'v0.19.3', method: 'tarball',
      exclude: ['tool-guides'], excludeChanged: true, committed: true, configCommitted: false,
      configNotice: '.context-forge.toml has other uncommitted changes; it was left out of the guide commit',
    });

    await run('update', '--yes');

    expect(stderr()).toContain('.context-forge.toml has other uncommitted changes');
  });

  it('install and update each warn when a submodule install ignores the key', async () => {
    mockInstall.mockResolvedValue({
      success: true, version: 'v0.19.3', method: 'submodule', path: tarballPath, excludeIgnored: true,
    });
    mockUpdate.mockResolvedValue({
      success: true, previousVersion: 'v0.19.3', newVersion: 'v0.19.3', method: 'submodule', excludeIgnored: true,
    });

    await run('install');
    await run('update');

    const ignored = stderr().split('\n').filter((l) => l.includes('guide.exclude is set but ignored for submodule installs'));
    expect(ignored).toHaveLength(2);
  });

  it('status shows the applied list and the pending-change line', async () => {
    mockStatus.mockResolvedValue({
      ...sampleGuideInfo, method: 'tarball', checkout: null,
      excludeApplied: ['tool-guides'], excludeConfigured: ['framework-guides', 'tool-guides'],
    });

    await run('info');

    expect(stdout()).toContain('Excluded:');
    expect(stdout()).toContain('guide.exclude changed — run cf guides update to apply');
  });

  it('status shows no pending line when config matches the record', async () => {
    mockStatus.mockResolvedValue({
      ...sampleGuideInfo, method: 'tarball', checkout: null,
      excludeApplied: ['tool-guides'], excludeConfigured: ['tool-guides'],
    });

    await run('info');

    expect(stdout()).not.toContain('guide.exclude changed');
  });

  it('status says the key is ignored for a submodule install', async () => {
    mockStatus.mockResolvedValue({ ...sampleGuideInfo, excludeConfigured: ['tool-guides'] });

    await run('info');

    expect(stdout()).toContain('guide.exclude is set but ignored for submodule installs');
  });

  it('status --json includes both exclude fields', async () => {
    mockStatus.mockResolvedValue({
      ...sampleGuideInfo, method: 'tarball', excludeApplied: ['tool-guides'], excludeConfigured: ['tool-guides'],
    });

    await run('info', '--json');

    const parsed = JSON.parse(vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string);
    expect(parsed.excludeApplied).toEqual(['tool-guides']);
    expect(parsed.excludeConfigured).toEqual(['tool-guides']);
  });

  it('prints a GuideExcludeError as a user error with no stack and exits non-zero', async () => {
    const message = 'guide.exclude entry "scripts" would remove scripts, which cf requires.';
    mockInstall.mockRejectedValue(new GuideExcludeError(message));

    await run('install');

    expect(process.exit).toHaveBeenCalledWith(1);
    expect(stderr()).toBe(message);
  });
});
