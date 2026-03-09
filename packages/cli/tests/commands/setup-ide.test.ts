import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerSetupIdeCommand } from '../../src/commands/setup-ide.js';

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockDetect = vi.fn();
const mockExistsSync = vi.fn();
const mockCopyFileSync = vi.fn();
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
    },
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    copyFileSync: (...args: unknown[]) => mockCopyFileSync(...args),
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

  it('creates .bak and invokes script with --yes when CLAUDE.md exists', async () => {
    mockDetect.mockResolvedValue({ installed: true });
    mockExistsSync.mockImplementation((p: string) => {
      if (p === scriptPath) return true;
      if (p === claudeMdPath) return true;
      return false;
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'setup-ide', 'claude', '--yes', '--project', 'proj_001']);

    expect(mockCopyFileSync).toHaveBeenCalledWith(claudeMdPath, claudeMdBakPath);
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'bash',
      [scriptPath, 'claude'],
      expect.objectContaining({ cwd: '/tmp/test', stdio: 'inherit' }),
    );

    const output = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Backed up CLAUDE.md');
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
