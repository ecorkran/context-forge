import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerSetupIdeCommand, setupIdeAction } from '../../src/commands/setup-ide.js';

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockDetect = vi.fn();
const mockExistsSync = vi.fn();
const mockCopyFileSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockExecFileSync = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
  })),
  GuideDetector: vi.fn().mockImplementation(() => ({
    detect: mockDetect,
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ value: '' }),
  })),
  GUIDE_RELATIVE_PATH: 'project-documents/ai-project-guide',
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (...args: unknown[]) => mockExistsSync(...args),
      copyFileSync: (...args: unknown[]) => mockCopyFileSync(...args),
      readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
    },
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    copyFileSync: (...args: unknown[]) => mockCopyFileSync(...args),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  };
});

vi.mock('node:child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

const sampleProject = {
  id: 'proj_001',
  name: 'test-project',
  projectPath: '/tmp/test',
};

const guidePath = '/tmp/test/project-documents/ai-project-guide';
const scriptPath = `${guidePath}/scripts/setup-ide`;
const claudeMdPath = '/tmp/test/CLAUDE.md';
const claudeMdBakPath = '/tmp/test/CLAUDE.md.bak';

const MANAGED_CONTENT = '[//]: # (context-forge:managed)\n\n# CLAUDE.md content';
const UNMANAGED_CONTENT = '# My custom CLAUDE.md\n\nSome instructions here.';

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerSetupIdeCommand(program);
  return program;
}

describe('cf setup-ide', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    mockGetById.mockResolvedValue(sampleProject);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('rejects invalid target', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'vim']);

    const output = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain("Invalid target 'vim'");
    expect(output).toContain('claude');
  });

  it('errors when guides not installed', async () => {
    mockDetect.mockResolvedValue({ installed: false });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'claude', '--project', 'proj_001']);

    const output = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Guides are not installed');
    expect(output).toContain('cf guides install');
  });

  it('errors when setup-ide script not found', async () => {
    mockDetect.mockResolvedValue({ installed: true });
    mockExistsSync.mockReturnValue(false);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'claude', '--project', 'proj_001']);

    const output = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('setup-ide script not found');
    expect(output).toContain(scriptPath);
  });

  it('proceeds without prompt when no CLAUDE.md', async () => {
    mockDetect.mockResolvedValue({ installed: true });
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === claudeMdPath) return false;
      return false;
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'claude', '--project', 'proj_001']);

    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bash',
      [scriptPath, 'claude'],
      expect.objectContaining({ cwd: '/tmp/test', stdio: 'inherit' }),
    );
  });

  it('creates .bak and invokes script with --yes when CLAUDE.md exists (no managed marker, no .bak)', async () => {
    mockDetect.mockResolvedValue({ installed: true });
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === claudeMdPath) return true;
      if (p === claudeMdBakPath) return false;
      return false;
    });
    mockReadFileSync.mockReturnValue(UNMANAGED_CONTENT);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'claude', '--yes', '--project', 'proj_001']);

    expect(mockCopyFileSync).toHaveBeenCalledWith(claudeMdPath, claudeMdBakPath);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bash',
      [scriptPath, 'claude'],
      expect.objectContaining({ cwd: '/tmp/test', stdio: 'inherit' }),
    );

    const logOutput = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logOutput).toContain('Backed up CLAUDE.md');
  });

  it('handles non-zero script exit code', async () => {
    mockDetect.mockResolvedValue({ installed: true });
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === claudeMdPath) return false;
      return false;
    });
    const execError = Object.assign(new Error('Command failed'), { status: 1 });
    mockExecFileSync.mockImplementation(() => { throw execError; });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'claude', '--project', 'proj_001']);

    const output = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('setup-ide exited with code 1');
  });
});

describe('setupIdeAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDetect.mockResolvedValue({ installed: true });
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      return false;
    });
    mockExecFileSync.mockReturnValue(undefined);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('skips backup when managed marker present, script runs', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === claudeMdPath) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(MANAGED_CONTENT);

    await setupIdeAction('/tmp/test', 'claude', { yes: true });

    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bash',
      [scriptPath, 'claude'],
      expect.objectContaining({ cwd: '/tmp/test' }),
    );
  });

  it('skips backup when no CLAUDE.md, script runs', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === claudeMdPath) return false;
      return false;
    });

    await setupIdeAction('/tmp/test', 'claude', { yes: true });

    expect(mockCopyFileSync).not.toHaveBeenCalled();
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bash',
      [scriptPath, 'claude'],
      expect.objectContaining({ cwd: '/tmp/test' }),
    );
  });

  it('copies to .bak and prints notice when no marker and no existing .bak', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === claudeMdPath) return true;
      if (p === claudeMdBakPath) return false;
      return false;
    });
    mockReadFileSync.mockReturnValue(UNMANAGED_CONTENT);

    await setupIdeAction('/tmp/test', 'claude', { yes: true });

    expect(mockCopyFileSync).toHaveBeenCalledWith(claudeMdPath, claudeMdBakPath);
    const logOutput = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logOutput).toContain('Backed up CLAUDE.md');
  });

  it('skips copy and prints preserved message when no marker but .bak exists', async () => {
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === claudeMdPath) return true;
      if (p === claudeMdBakPath) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(UNMANAGED_CONTENT);

    await setupIdeAction('/tmp/test', 'claude', { yes: true });

    expect(mockCopyFileSync).not.toHaveBeenCalled();
    const logOutput = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logOutput).toContain('existing backup preserved at CLAUDE.md.bak');
  });
});
