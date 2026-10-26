import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import {
  BROWNFIELD_LINE,
  GuideAlreadyInstalledError,
  INCOMPLETE_ADOPTION_LINE,
  INIT_REPORT_VERSION,
  inconclusiveDetectionLine,
  serializeErrorEnvelope,
} from '@context-forge/core/node';
import { registerInitCommand } from '../../src/commands/init.js';
import { HUMAN_OUTPUT, INIT_STEP, SKIP_REASON, STEP_STATUS, WORKTREE_REFUSAL, runSetupSteps } from '../../src/commands/initSteps.js';

const mockGetAll = vi.fn();
const mockCreate = vi.fn();
const mockExistsSync = vi.fn();
const mockReadFileSync = vi.fn();
const mockWriteFileSync = vi.fn();
const mockExecFileSync = vi.fn();
const mockGuidesInstallAction = vi.fn();
const mockSetupIdeAction = vi.fn();
const mockInstallCommandsAction = vi.fn();
const GREENFIELD_DETECTION = { outcome: { kind: 'greenfield', source: { files: 0, lines: 0, capped: false } } };
// cwd is the cli package, which would read as brownfield; tests choose the outcome explicitly.
const mockDetectProject = vi.fn().mockResolvedValue(GREENFIELD_DETECTION);

vi.mock('@context-forge/core/node', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@context-forge/core/node')>();
  return {
    // The cli modules import constants and helpers from core at load time.
    ...actual,
    FileProjectStore: vi.fn().mockImplementation(() => ({
      getAll: mockGetAll,
      create: mockCreate,
    })),
    detectProject: (...args: unknown[]) => mockDetectProject(...args),
  };
});

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
  // cf init renders its --strategy help from the same descriptor as
  // cf guides install, so the option help is identical in both places.
  strategyHelpText: () => 'Installation strategy — submodule (...); clone (...); tarball (...)',
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

// A failed step now sets the exit code (slice 271 D8); keep it from leaking between tests.
afterEach(() => {
  process.exitCode = undefined;
});

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

  it('does not run git init in a subfolder of an existing repository (#133)', async () => {
    mockGetAll.mockResolvedValue([]);
    // No .git in cwd, but an enclosing repository exists
    mockExistsSync.mockReturnValue(false);
    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === 'git' && args[0] === 'rev-parse') return 'true\n';
      return '';
    });

    const program = createProgram();
    await program.parseAsync(['init'], { from: 'user' });

    expect(mockExecFileSync).not.toHaveBeenCalledWith('git', ['init'], expect.anything());
    expect(mockCreate).toHaveBeenCalled();
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

    expect(mockInstallCommandsAction).toHaveBeenCalledWith('agents', {}, expect.any(Function));
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
      expect.any(Function),
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
      expect.any(Function),
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
      expect.any(Function),
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
    mockGuidesInstallAction.mockRejectedValue(new GuideAlreadyInstalledError());

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

describe('cf init --strategy (D8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockExistsSync.mockImplementation((p: string) => p.endsWith('.git'));
    mockCreate.mockResolvedValue({ id: 'project_new_001', name: 'test-dir' });
    mockGuidesInstallAction.mockResolvedValue(undefined);
    mockSetupIdeAction.mockResolvedValue(undefined);
    mockInstallCommandsAction.mockReturnValue(undefined);
    mockGetAll.mockResolvedValue([]);
  });

  it('passes a canonical strategy through to the install action', async () => {
    const program = createProgram();
    await program.parseAsync(['init', '--strategy', 'tarball', '--no-ide'], { from: 'user' });

    expect(mockGuidesInstallAction).toHaveBeenCalledWith(
      process.cwd(),
      { strategy: 'tarball' },
      expect.any(Function),
    );
  });

  it('passes the deprecated alias through unchanged so one place normalizes it', async () => {
    const program = createProgram();
    await program.parseAsync(['init', '--strategy', 'manual', '--no-ide'], { from: 'user' });

    // guidesInstallAction owns normalization and the deprecation warning, so
    // init must not pre-translate the value.
    expect(mockGuidesInstallAction).toHaveBeenCalledWith(
      process.cwd(),
      { strategy: 'manual' },
      expect.any(Function),
    );
  });

  it('omits the strategy when the flag is absent, leaving config to decide', async () => {
    const program = createProgram();
    await program.parseAsync(['init', '--no-ide'], { from: 'user' });

    expect(mockGuidesInstallAction).toHaveBeenCalledWith(
      process.cwd(),
      { strategy: undefined },
      expect.any(Function),
    );
  });

  it('surfaces an invalid strategy as a warning without aborting init', async () => {
    mockGuidesInstallAction.mockRejectedValue(
      new Error("Invalid guide strategy 'bogus'. Valid values: submodule, clone, tarball."),
    );

    const program = createProgram();
    await program.parseAsync(['init', '--strategy', 'bogus', '--no-ide'], { from: 'user' });

    const output = vi.mocked(console.log).mock.calls.map((c) => String(c[0] ?? '')).join('\n');
    expect(output).toContain('bogus');
    expect(output).toContain('submodule, clone, tarball');
  });
});

describe('cf init step results and exit code (D8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockExistsSync.mockImplementation((p: string) => p.endsWith('.git'));
    mockCreate.mockResolvedValue({ id: 'project_new_001', name: 'test-dir' });
    mockGuidesInstallAction.mockResolvedValue(undefined);
    mockSetupIdeAction.mockResolvedValue(undefined);
    mockInstallCommandsAction.mockReturnValue(undefined);
    mockGetAll.mockResolvedValue([]);
  });

  async function runInit(...args: string[]): Promise<void> {
    await createProgram().parseAsync(['init', ...args], { from: 'user' });
  }

  it('exits 0 when every step succeeds', async () => {
    await runInit();
    expect(process.exitCode).toBeUndefined();
  });

  it('exits 1 when the guide install fails, and still runs the later steps', async () => {
    mockGuidesInstallAction.mockRejectedValue(new Error('Invalid guide strategy'));
    await runInit('--strategy', 'bogus');
    expect(process.exitCode).toBe(1);
    expect(mockSetupIdeAction).toHaveBeenCalled();
  });

  it('exits 1 when the IDE setup fails', async () => {
    mockSetupIdeAction.mockRejectedValue(new Error('setup-ide failed'));
    await runInit();
    expect(process.exitCode).toBe(1);
  });

  it('exits 1 when the command install fails', async () => {
    mockInstallCommandsAction.mockImplementation(() => {
      throw new Error('cannot write');
    });
    await runInit();
    expect(process.exitCode).toBe(1);
  });

  it('exits 1 when git init fails', async () => {
    mockExistsSync.mockReturnValue(false);
    mockExecFileSync.mockImplementation(() => {
      throw new Error('git not found');
    });
    await runInit('--lite');
    expect(process.exitCode).toBe(1);
    mockExecFileSync.mockReset();
  });

  it('an already-installed guide is skipped, not failed', async () => {
    mockGuidesInstallAction.mockRejectedValue(new GuideAlreadyInstalledError());
    await runInit();
    expect(process.exitCode).toBeUndefined();
  });

  it('the worktree refusal still exits 0', async () => {
    mockGetAll.mockResolvedValue([{ id: 'p1', name: 'main-repo', projectPath: '/repo/main' }]);
    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) =>
      args[0] === 'worktree' ? 'worktree /repo/main\nHEAD abc\n' : '',
    );
    await runInit();
    expect(process.exitCode).toBeUndefined();
    expect(mockCreate).not.toHaveBeenCalled();
    mockExecFileSync.mockReset();
  });

  describe('runSetupSteps statuses', () => {
    const statusOf = (steps: { step: string; status: string; message?: string }[], step: string) =>
      steps.find((result) => result.step === step);

    it('--lite marks guides, commands and ide skipped', async () => {
      const steps = await runSetupSteps('/work', { lite: true }, HUMAN_OUTPUT);
      for (const step of [INIT_STEP.guides, INIT_STEP.commands, INIT_STEP.ide]) {
        expect(statusOf(steps, step)).toEqual({ step, status: STEP_STATUS.skipped, message: SKIP_REASON.lite });
      }
    });

    it('--no-ide marks commands and ide skipped and runs guides', async () => {
      const steps = await runSetupSteps('/work', { ide: false }, HUMAN_OUTPUT);
      expect(statusOf(steps, INIT_STEP.guides)?.status).toBe(STEP_STATUS.ok);
      expect(statusOf(steps, INIT_STEP.commands)).toEqual({
        step: INIT_STEP.commands,
        status: STEP_STATUS.skipped,
        message: SKIP_REASON.noIde,
      });
      expect(statusOf(steps, INIT_STEP.ide)?.status).toBe(STEP_STATUS.skipped);
    });

    it('a target without command delivery marks commands skipped and still sets up the IDE', async () => {
      const steps = await runSetupSteps('/work', { ide: 'cursor' }, HUMAN_OUTPUT);
      expect(statusOf(steps, INIT_STEP.commands)?.message).toBe(SKIP_REASON.noCommandDelivery);
      expect(statusOf(steps, INIT_STEP.ide)?.status).toBe(STEP_STATUS.ok);
    });

    it('an already-installed guide is skipped with the error message; a real failure is failed', async () => {
      mockGuidesInstallAction.mockRejectedValueOnce(new GuideAlreadyInstalledError());
      const skipped = await runSetupSteps('/work', { ide: false }, HUMAN_OUTPUT);
      expect(statusOf(skipped, INIT_STEP.guides)?.status).toBe(STEP_STATUS.skipped);

      mockGuidesInstallAction.mockRejectedValueOnce(new Error('Network error'));
      const failed = await runSetupSteps('/work', { ide: false }, HUMAN_OUTPUT);
      expect(statusOf(failed, INIT_STEP.guides)).toEqual({
        step: INIT_STEP.guides,
        status: STEP_STATUS.failed,
        message: 'Network error',
      });
    });
  });
});

describe('cf init --json (D8)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockExistsSync.mockImplementation((p: string) => p.endsWith('.git'));
    mockCreate.mockResolvedValue({ id: 'project_new_001', name: 'test-dir' });
    mockGuidesInstallAction.mockResolvedValue(undefined);
    mockSetupIdeAction.mockResolvedValue(undefined);
    mockInstallCommandsAction.mockReturnValue(undefined);
    mockGetAll.mockResolvedValue([]);
  });

  const written = (stream: NodeJS.WriteStream): string =>
    vi.mocked(stream.write).mock.calls.map((call) => String(call[0])).join('');

  async function runInitJson(...args: string[]): Promise<void> {
    await createProgram().parseAsync(['init', '--json', ...args], { from: 'user' });
  }

  it('an all-ok run writes exactly one JSON object to stdout and progress only to stderr', async () => {
    await runInitJson();

    const report = JSON.parse(written(process.stdout));
    expect(report).toMatchObject({
      reportVersion: INIT_REPORT_VERSION,
      projectId: 'project_new_001',
      projectName: 'test-dir',
      projectPath: process.cwd(),
      registration: 'created',
      notices: [],
      ok: true,
    });
    expect(report.steps.map((step: { step: string }) => step.step)).toEqual(Object.values(INIT_STEP));
    expect(written(process.stderr)).toContain('Project');
    expect(console.log).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  });

  it('hands every action the stderr sink', async () => {
    await runInitJson();

    expect(mockGuidesInstallAction).toHaveBeenCalledWith(process.cwd(), { strategy: undefined }, expect.any(Function));
    const sink = mockGuidesInstallAction.mock.calls[0][2] as (line: string) => void;
    sink('a progress line');
    expect(written(process.stderr)).toContain('a progress line');
    expect(written(process.stdout)).not.toContain('a progress line');
  });

  it('an existing project reports registration: existing', async () => {
    mockGetAll.mockResolvedValue([{ id: 'project_old', name: 'old-name', projectPath: process.cwd() }]);
    await runInitJson();
    expect(JSON.parse(written(process.stdout))).toMatchObject({
      registration: 'existing',
      projectId: 'project_old',
      projectName: 'old-name',
    });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('a failed guide step is ok: false with exit 1, not an error envelope', async () => {
    mockGuidesInstallAction.mockRejectedValue(new Error('Network error'));
    await runInitJson();

    const report = JSON.parse(written(process.stdout));
    expect(report.ok).toBe(false);
    expect(report.error).toBeUndefined();
    expect(report.steps.find((step: { step: string }) => step.step === INIT_STEP.guides)).toEqual({
      step: INIT_STEP.guides,
      status: STEP_STATUS.failed,
      message: 'Network error',
    });
    expect(process.exitCode).toBe(1);
  });

  it('--lite reports the skipped steps', async () => {
    await runInitJson('--lite');
    const report = JSON.parse(written(process.stdout));
    const liteSkipped = report.steps
      .filter((step: { message?: string }) => step.message === SKIP_REASON.lite)
      .map((step: { step: string; status: string }) => [step.step, step.status]);
    expect(liteSkipped).toEqual([
      [INIT_STEP.guides, STEP_STATUS.skipped],
      [INIT_STEP.commands, STEP_STATUS.skipped],
      [INIT_STEP.ide, STEP_STATUS.skipped],
    ]);
  });

  it('the worktree refusal is the shared error envelope with exit 1', async () => {
    mockGetAll.mockResolvedValue([{ id: 'p1', name: 'main-repo', projectPath: '/repo/main' }]);
    mockExecFileSync.mockImplementation((_cmd: string, args: string[]) =>
      args[0] === 'worktree' ? 'worktree /repo/main\nHEAD abc\n' : '',
    );

    await runInitJson();

    expect(written(process.stdout)).toBe(
      serializeErrorEnvelope(INIT_REPORT_VERSION, 'worktree-of-registered-project', WORKTREE_REFUSAL) + '\n',
    );
    expect(process.exitCode).toBe(1);
    expect(mockCreate).not.toHaveBeenCalled();
    mockExecFileSync.mockReset();
  });

  it('a registration failure is an internal envelope with no step results', async () => {
    mockCreate.mockRejectedValue(new Error('store is read-only'));

    await runInitJson();

    expect(written(process.stdout)).toBe(
      serializeErrorEnvelope(INIT_REPORT_VERSION, 'internal', 'store is read-only') + '\n',
    );
    expect(JSON.parse(written(process.stdout)).steps).toBeUndefined();
    expect(process.exitCode).toBe(1);
    expect(mockGuidesInstallAction).not.toHaveBeenCalled();
  });
});

describe('cf init codebase line (D9)', () => {
  const BROWNFIELD_DETECTION = { outcome: { kind: 'brownfield', source: { files: 9, lines: 2000, capped: true } } };
  const INCOMPLETE_DETECTION = { outcome: { kind: 'adoption-incomplete', derivedArchitectures: ['a'] } };

  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockExistsSync.mockImplementation((p: string) => p.endsWith('.git'));
    mockCreate.mockResolvedValue({ id: 'project_new_001', name: 'test-dir' });
    mockGuidesInstallAction.mockResolvedValue(undefined);
    mockSetupIdeAction.mockResolvedValue(undefined);
    mockInstallCommandsAction.mockReturnValue(undefined);
    mockGetAll.mockResolvedValue([]);
  });

  const logged = (): string => vi.mocked(console.log).mock.calls.map((c) => String(c[0])).join('\n');

  async function runInit(...args: string[]): Promise<void> {
    await createProgram().parseAsync(['init', ...args], { from: 'user' });
  }

  it('brownfield prints the brownfield line', async () => {
    mockDetectProject.mockResolvedValueOnce(BROWNFIELD_DETECTION);
    await runInit();
    expect(logged()).toContain(BROWNFIELD_LINE);
    expect(mockDetectProject).toHaveBeenCalledWith(process.cwd());
  });

  it('an incomplete adoption prints the incomplete line', async () => {
    mockDetectProject.mockResolvedValueOnce(INCOMPLETE_DETECTION);
    await runInit();
    expect(logged()).toContain(INCOMPLETE_ADOPTION_LINE);
  });

  it('greenfield prints neither adoption line', async () => {
    await runInit();
    expect(logged()).not.toContain(BROWNFIELD_LINE);
    expect(logged()).not.toContain(INCOMPLETE_ADOPTION_LINE);
  });

  it('a detection error prints the inconclusive line and still exits 0', async () => {
    mockDetectProject.mockRejectedValueOnce(new Error('walk failed'));
    await runInit();
    expect(logged()).toContain(inconclusiveDetectionLine('walk failed'));
    expect(process.exitCode).toBeUndefined();
  });

  it('--json puts the line in notices and not in the progress output', async () => {
    mockDetectProject.mockResolvedValueOnce(BROWNFIELD_DETECTION);
    await runInit('--json');
    const stdout = vi.mocked(process.stdout.write).mock.calls.map((c) => String(c[0])).join('');
    expect(JSON.parse(stdout).notices).toEqual([BROWNFIELD_LINE]);
  });

  it('--json with a detection error puts the inconclusive line in notices, with ok: true', async () => {
    mockDetectProject.mockRejectedValueOnce(new Error('walk failed'));
    await runInit('--json');
    const stdout = vi.mocked(process.stdout.write).mock.calls.map((c) => String(c[0])).join('');
    const report = JSON.parse(stdout);
    expect(report.notices).toEqual([inconclusiveDetectionLine('walk failed')]);
    expect(report.ok).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });
});
