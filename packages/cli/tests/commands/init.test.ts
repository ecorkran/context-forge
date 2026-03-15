import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerInitCommand } from '../../src/commands/init.js';

const mockGetAll = vi.fn();
const mockCreate = vi.fn();
const mockExistsSync = vi.fn();
const mockExecFileSync = vi.fn();
const mockGuidesInstallAction = vi.fn();
const mockSetupIdeAction = vi.fn();
const mockInstallCommandsAction = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    create: mockCreate,
  })),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (...args: unknown[]) => mockExistsSync(...args),
    },
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
  };
});

vi.mock('node:child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

vi.mock('../../src/commands/guides.js', () => ({
  guidesInstallAction: (...args: unknown[]) => mockGuidesInstallAction(...args),
  registerGuidesCommand: vi.fn(),
}));

vi.mock('../../src/commands/setup-ide.js', () => ({
  setupIdeAction: (...args: unknown[]) => mockSetupIdeAction(...args),
  registerSetupIdeCommand: vi.fn(),
}));

vi.mock('../../src/commands/commandInstaller.js', () => ({
  installCommandsAction: (...args: unknown[]) => mockInstallCommandsAction(...args),
  installCommands: vi.fn(),
  uninstallCommands: vi.fn(),
  getSourceCommandsDir: vi.fn(),
  registerInstallCommandsCommand: vi.fn(),
  registerUninstallCommandsCommand: vi.fn(),
}));

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerInitCommand(program);
  return program;
}

describe('cf init', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // Default: .git exists, actions succeed
    mockExistsSync.mockImplementation((p: string) => p.endsWith('.git'));
    mockCreate.mockResolvedValue({ id: 'project_new_001', name: 'test-dir' });
    mockGuidesInstallAction.mockResolvedValue(undefined);
    mockSetupIdeAction.mockResolvedValue(undefined);
    mockInstallCommandsAction.mockReturnValue(undefined);
  });

  it('creates project with directory basename as name', async () => {
    mockGetAll.mockResolvedValue([]);

    const program = createProgram();
    await program.parseAsync(['init'], { from: 'user' });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expect.any(String),
        projectPath: process.cwd(),
        template: 'default',
        fileSlice: '',
        instruction: 'Phase 1: Concept',
      }),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('registered'),
    );
  });

  it('uses --name override when provided', async () => {
    mockGetAll.mockResolvedValue([]);

    const program = createProgram();
    await program.parseAsync(['init', '--name', 'custom-name'], { from: 'user' });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'custom-name',
      }),
    );
  });

  it('warns without creating when project already registered', async () => {
    mockGetAll.mockResolvedValue([
      { id: 'proj_existing', name: 'existing', projectPath: process.cwd() },
    ]);

    const program = createProgram();
    await program.parseAsync(['init'], { from: 'user' });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('already registered'),
    );
  });

  it('runs git init when no .git directory', async () => {
    mockGetAll.mockResolvedValue([]);
    // No .git exists
    mockExistsSync.mockReturnValue(false);

    const program = createProgram();
    await program.parseAsync(['init'], { from: 'user' });

    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['init'],
      expect.objectContaining({ cwd: process.cwd() }),
    );
  });

  it('warns and returns when git worktree of registered project is detected', async () => {
    const mainWorktreePath = '/some/main/project';
    mockGetAll.mockResolvedValue([
      { id: 'proj_main', name: 'main', projectPath: mainWorktreePath },
    ]);
    mockExistsSync.mockReturnValue(true); // .git exists
    // Simulate git worktree list output: main is registered, cwd is different
    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'git' && args[0] === 'worktree') {
        return `worktree ${mainWorktreePath}\nHEAD abc123\nbranch refs/heads/main\n\nworktree ${process.cwd()}\nHEAD def456\nbranch refs/heads/feature\n`;
      }
      return '';
    });

    const program = createProgram();
    await program.parseAsync(['init'], { from: 'user' });

    expect(mockCreate).not.toHaveBeenCalled();
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('worktree'),
    );
  });

  it('--lite skips guides, commands, and IDE setup', async () => {
    mockGetAll.mockResolvedValue([]);

    const program = createProgram();
    await program.parseAsync(['init', '--lite'], { from: 'user' });

    expect(mockCreate).toHaveBeenCalled();
    expect(mockGuidesInstallAction).not.toHaveBeenCalled();
    expect(mockInstallCommandsAction).not.toHaveBeenCalled();
    expect(mockSetupIdeAction).not.toHaveBeenCalled();
  });

  it('--no-ide skips IDE setup but runs guides and commands', async () => {
    mockGetAll.mockResolvedValue([]);

    const program = createProgram();
    await program.parseAsync(['init', '--no-ide'], { from: 'user' });

    expect(mockCreate).toHaveBeenCalled();
    expect(mockGuidesInstallAction).toHaveBeenCalled();
    expect(mockInstallCommandsAction).toHaveBeenCalled();
    expect(mockSetupIdeAction).not.toHaveBeenCalled();
  });

  it('--ide cursor calls setupIdeAction with cursor target', async () => {
    mockGetAll.mockResolvedValue([]);

    const program = createProgram();
    await program.parseAsync(['init', '--ide', 'cursor'], { from: 'user' });

    expect(mockSetupIdeAction).toHaveBeenCalledWith(
      process.cwd(),
      'cursor',
      expect.objectContaining({ yes: true }),
    );
  });

  it('guides already installed prints skip message and continues', async () => {
    mockGetAll.mockResolvedValue([]);
    mockGuidesInstallAction.mockRejectedValue(new Error('Guide is already installed. Use guide_update to update it.'));

    const program = createProgram();
    await program.parseAsync(['init'], { from: 'user' });

    const logOutput = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logOutput).toContain('skipping');
    // Commands and IDE still ran
    expect(mockInstallCommandsAction).toHaveBeenCalled();
    expect(mockSetupIdeAction).toHaveBeenCalled();
  });

  it('guides install failure prints warning and continues', async () => {
    mockGetAll.mockResolvedValue([]);
    mockGuidesInstallAction.mockRejectedValue(new Error('Network error'));

    const program = createProgram();
    await program.parseAsync(['init'], { from: 'user' });

    const logOutput = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logOutput).toContain('Guides install failed');
    // Should not have called process.exit, commands still ran
    expect(mockInstallCommandsAction).toHaveBeenCalled();
  });
});
