import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerInitCommand } from '../../src/commands/init.js';

const mockGetAll = vi.fn();
const mockCreate = vi.fn();
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();
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
      readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
      writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
    },
    existsSync: (...args: unknown[]) => mockExistsSync(...args),
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
    writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  };
});

vi.mock('node:child_process', () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

vi.mock('../../src/commands/guides.js', () => ({
  guidesInstallAction: (...args: unknown[]) => mockGuidesInstallAction(...args),
  registerGuidesCommand: vi.fn(),
}));

vi.mock('../../src/commands/setup-ide.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/commands/setup-ide.js')>();
  return {
    ...actual,
    setupIdeAction: (...args: unknown[]) => mockSetupIdeAction(...args),
    registerSetupIdeCommand: vi.fn(),
  };
});

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
        instruction: 'Phase 0: Concept',
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

  it('--no-ide skips IDE setup and command delivery but runs guides', async () => {
    mockGetAll.mockResolvedValue([]);

    const program = createProgram();
    await program.parseAsync(['init', '--no-ide'], { from: 'user' });

    expect(mockCreate).toHaveBeenCalled();
    expect(mockGuidesInstallAction).toHaveBeenCalled();
    // Slice 924: command delivery is IDE-targeted, so --no-ide skips it too.
    expect(mockInstallCommandsAction).not.toHaveBeenCalled();
    expect(mockSetupIdeAction).not.toHaveBeenCalled();
  });

  it('installs commands globally for the resolved IDE target', async () => {
    mockGetAll.mockResolvedValue([]);

    const program = createProgram();
    await program.parseAsync(['init', '--ide', 'codex'], { from: 'user' });

    expect(mockInstallCommandsAction).toHaveBeenCalledWith('agents', { global: true });
  });

  it('does not install commands for targets without command delivery', async () => {
    mockGetAll.mockResolvedValue([]);

    const program = createProgram();
    await program.parseAsync(['init', '--ide', 'cursor'], { from: 'user' });

    expect(mockInstallCommandsAction).not.toHaveBeenCalled();
    expect(mockSetupIdeAction).toHaveBeenCalled();
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

  it('defaults to claude when --ide is omitted', async () => {
    mockGetAll.mockResolvedValue([]);

    const program = createProgram();
    await program.parseAsync(['init'], { from: 'user' });

    expect(mockSetupIdeAction).toHaveBeenCalledWith(
      process.cwd(),
      'claude',
      expect.objectContaining({ yes: true }),
    );
  });

  it('--ide codex reaches setupIdeAction with the raw alias string', async () => {
    mockGetAll.mockResolvedValue([]);

    const program = createProgram();
    await program.parseAsync(['init', '--ide', 'codex'], { from: 'user' });

    expect(mockSetupIdeAction).toHaveBeenCalledWith(
      process.cwd(),
      'codex',
      expect.objectContaining({ yes: true }),
    );
  });

  it('--ide codex completion message names agents and shows the alias', async () => {
    mockGetAll.mockResolvedValue([]);

    const program = createProgram();
    await program.parseAsync(['init', '--ide', 'codex'], { from: 'user' });

    const logOutput = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logOutput).toContain('IDE configured for agents (codex)');
  });

  it('--ide claude completion message has no parenthetical', async () => {
    mockGetAll.mockResolvedValue([]);

    const program = createProgram();
    await program.parseAsync(['init', '--ide', 'claude'], { from: 'user' });

    const logOutput = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logOutput).toContain('IDE configured for claude');
    expect(logOutput).not.toContain('claude (');
  });

  it('--ide notarealtarget surfaces the invalid-target error and prints no success line', async () => {
    mockGetAll.mockResolvedValue([]);
    mockSetupIdeAction.mockRejectedValue(new Error("Invalid target 'notarealtarget'. Valid targets: claude, copilot, cursor, agents (aliases: openai, codex → agents)"));

    const program = createProgram();
    await program.parseAsync(['init', '--ide', 'notarealtarget'], { from: 'user' });

    const logOutput = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logOutput).toContain('IDE setup failed');
    expect(logOutput).toContain("Invalid target 'notarealtarget'");
    expect(logOutput).not.toContain('IDE configured for');
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

  it('automatically retries with --ide copilot when the primary IDE setup fails, and announces the retry', async () => {
    mockGetAll.mockResolvedValue([]);
    mockSetupIdeAction
      .mockRejectedValueOnce(new Error('setup-ide script not found'))
      .mockResolvedValueOnce(undefined);

    const program = createProgram();
    await program.parseAsync(['init'], { from: 'user' });

    expect(mockSetupIdeAction).toHaveBeenNthCalledWith(
      1,
      process.cwd(),
      'claude',
      expect.objectContaining({ yes: true }),
    );
    expect(mockSetupIdeAction).toHaveBeenNthCalledWith(
      2,
      process.cwd(),
      'copilot',
      expect.objectContaining({ yes: true }),
    );

    const logOutput = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logOutput).toContain('IDE setup failed for claude');
    expect(logOutput).toMatch(/trying --ide copilot/i);
    expect(logOutput).toContain('IDE configured for copilot');
  });

  it('tells the user to use --ide copilot directly next time after a successful fallback', async () => {
    mockGetAll.mockResolvedValue([]);
    mockSetupIdeAction
      .mockRejectedValueOnce(new Error('setup-ide script not found'))
      .mockResolvedValueOnce(undefined);

    const program = createProgram();
    await program.parseAsync(['init'], { from: 'user' });

    const logOutput = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logOutput).toMatch(/cf init --ide copilot/);
    expect(logOutput).toMatch(/next time/i);
  });

  it('does not retry when the primary target is already copilot', async () => {
    mockGetAll.mockResolvedValue([]);
    mockSetupIdeAction.mockRejectedValue(new Error('boom'));

    const program = createProgram();
    await program.parseAsync(['init', '--ide', 'copilot'], { from: 'user' });

    expect(mockSetupIdeAction).toHaveBeenCalledTimes(1);
    const logOutput = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logOutput).not.toMatch(/trying --ide copilot/i);
  });

  it('reports both failures when the copilot fallback also fails', async () => {
    mockGetAll.mockResolvedValue([]);
    mockSetupIdeAction.mockRejectedValue(new Error('Guides are not installed. Run \'cf guides install\' first.'));

    const program = createProgram();
    await program.parseAsync(['init'], { from: 'user' });

    expect(mockSetupIdeAction).toHaveBeenCalledTimes(2);
    const logOutput = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(logOutput).toContain('IDE setup failed for claude');
    expect(logOutput).toMatch(/fallback.*also failed/is);
    expect(logOutput).not.toContain('IDE configured for');
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

  describe('.gitignore handling for the personal config file', () => {
    it('creates .gitignore containing the personal config line when none exists', async () => {
      mockGetAll.mockResolvedValue([]);
      mockExistsSync.mockImplementation((p: string) => p.endsWith('.git')); // .gitignore absent

      const program = createProgram();
      await program.parseAsync(['init', '--lite'], { from: 'user' });

      const gitignoreCall = vi.mocked(mockWriteFileSync).mock.calls.find((c) =>
        String(c[0]).endsWith('.gitignore'),
      );
      expect(gitignoreCall).toBeDefined();
      expect(gitignoreCall![1]).toBe('.context-forge.local.toml\n');
    });

    it('appends the personal config line to an existing .gitignore that lacks it', async () => {
      mockGetAll.mockResolvedValue([]);
      mockExistsSync.mockImplementation((p: string) => p.endsWith('.git') || p.endsWith('.gitignore'));
      mockReadFileSync.mockImplementation((p: string) => {
        if (String(p).endsWith('.gitignore')) return 'node_modules\n';
        throw new Error(`unexpected readFileSync path: ${p}`);
      });

      const program = createProgram();
      await program.parseAsync(['init', '--lite'], { from: 'user' });

      const gitignoreCall = vi.mocked(mockWriteFileSync).mock.calls.find((c) =>
        String(c[0]).endsWith('.gitignore'),
      );
      expect(gitignoreCall).toBeDefined();
      expect(gitignoreCall![1]).toBe('node_modules\n.context-forge.local.toml\n');
    });

    it('inserts a newline before the appended line when the existing .gitignore has no trailing newline', async () => {
      mockGetAll.mockResolvedValue([]);
      mockExistsSync.mockImplementation((p: string) => p.endsWith('.git') || p.endsWith('.gitignore'));
      mockReadFileSync.mockImplementation((p: string) => {
        if (String(p).endsWith('.gitignore')) return 'node_modules';
        throw new Error(`unexpected readFileSync path: ${p}`);
      });

      const program = createProgram();
      await program.parseAsync(['init', '--lite'], { from: 'user' });

      const gitignoreCall = vi.mocked(mockWriteFileSync).mock.calls.find((c) =>
        String(c[0]).endsWith('.gitignore'),
      );
      expect(gitignoreCall).toBeDefined();
      expect(gitignoreCall![1]).toBe('node_modules\n.context-forge.local.toml\n');
    });

    it('leaves .gitignore unchanged (no duplicate line) when it already contains the personal config line', async () => {
      mockGetAll.mockResolvedValue([]);
      mockExistsSync.mockImplementation((p: string) => p.endsWith('.git') || p.endsWith('.gitignore'));
      mockReadFileSync.mockImplementation((p: string) => {
        if (String(p).endsWith('.gitignore')) return 'node_modules\n.context-forge.local.toml\n';
        throw new Error(`unexpected readFileSync path: ${p}`);
      });

      const program = createProgram();
      await program.parseAsync(['init', '--lite'], { from: 'user' });

      const gitignoreCall = vi.mocked(mockWriteFileSync).mock.calls.find((c) =>
        String(c[0]).endsWith('.gitignore'),
      );
      expect(gitignoreCall).toBeUndefined();
    });
  });
});
