import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerConfigCommand } from '../../src/commands/config.js';
import { resolveProject } from '@context-forge/core';
import { resolveProjectWorktree } from '../../src/utils/project.js';
import { UserError } from '../../src/utils/errors.js';

// Mock ConfigManager
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDelete = vi.fn();
const mockList = vi.fn();
const mockGetRawProjectFileValues = vi.fn();
const mockDeleteFromSharedProjectFile = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: mockGet,
    set: mockSet,
    delete: mockDelete,
    list: mockList,
    getRawProjectFileValues: mockGetRawProjectFileValues,
    deleteFromSharedProjectFile: mockDeleteFromSharedProjectFile,
  })),
  FileProjectStore: vi.fn().mockImplementation(() => ({})),
  // The set command consults CONFIG_KEYS to coerce the raw string argument
  // toward each key's declared type (a string-typed key must NOT be number-coerced
  // even when its value is all digits, e.g. a YYYYMMDD date). Mirror just the
  // keys the tests exercise, with their real declared types. migrate-personal
  // iterates CONFIG_KEYS for scope === 'personal', so git.integration_branch
  // (the only personal-scope key) must be present here too.
  CONFIG_KEYS: {
    'guide.source': { type: 'string', default: '', description: '', scope: 'shared' },
    'workflow.review_enabled': { type: 'boolean', default: false, description: '', scope: 'shared' },
    'workflow.review_gate_effective_date': { type: 'string', default: '', description: '', scope: 'shared' },
    'some.flag': { type: 'boolean', default: false, description: '', scope: 'shared' },
    'git.integration_branch': { type: 'string', default: '', description: '', scope: 'personal' },
  },
}));

// Default: no registered project resolves — resolveConfigProjectPath falls through to
// its raw-existing-directory fallback (or user scope when --project is omitted). Tests
// that need registry resolution override these with mockResolvedValueOnce. Rejects with
// UserError to match resolveProjectWorktree's real "not found" behavior — the config.ts
// catch block only swallows UserError and rethrows anything else.
vi.mock('@context-forge/core', () => ({
  resolveProject: vi.fn().mockResolvedValue(null),
}));
vi.mock('../../src/utils/project.js', async () => {
  const { UserError: RealUserError } = await import('../../src/utils/errors.js');
  return {
    resolveProjectWorktree: vi.fn().mockRejectedValue(new RealUserError('not found')),
  };
});

function createProgram(): Command {
  const program = new Command();
  program.exitOverride(); // Throw instead of process.exit
  registerConfigCommand(program);
  return program;
}

describe('cf config get (no key — list all)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  it('renders aligned text with key/value/source', async () => {
    mockList.mockResolvedValue([
      { key: 'guide.source', value: 'https://example.com', source: 'user', description: '' },
      { key: 'guide.git_strategy', value: 'submodule', source: 'default', description: '' },
    ]);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'get']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('guide.source');
    expect(output).toContain('https://example.com');
    expect(output).toContain('user');
    expect(output).toContain('guide.git_strategy');
    expect(output).toContain('submodule');
  });

  it('outputs JSON when --json flag is set', async () => {
    const entries = [
      { key: 'guide.source', value: 'https://example.com', source: 'user', description: '' },
    ];
    mockList.mockResolvedValue(entries);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'get', '--json']);

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    expect(JSON.parse(output)).toEqual(entries);
  });
});

describe('cf config get', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  it('displays key, value, and source', async () => {
    mockGet.mockResolvedValue({
      key: 'guide.source',
      value: 'https://example.com',
      source: 'user',
      description: 'URL or path to the AI project guide source',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'get', 'guide.source']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const joined = calls.join('\n');
    expect(joined).toContain('guide.source');
    expect(joined).toContain('https://example.com');
    expect(joined).toContain('user');
  });

  it('outputs JSON when --json flag is set', async () => {
    const result = { key: 'k', value: 'v', source: 'default', description: '' };
    mockGet.mockResolvedValue(result);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'get', 'k', '--json']);

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    expect(JSON.parse(output)).toEqual(result);
  });
});

describe('cf config set', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('calls ConfigManager.set with project scope by default (no flags)', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'set', 'guide.source', 'https://example.com']);

    expect(mockSet).toHaveBeenCalledWith('guide.source', 'https://example.com', 'project');
  });

  it('calls ConfigManager.set with user scope when --global is passed', async () => {
    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'config', 'set', 'guide.source', 'https://example.com', '--global',
    ]);

    expect(mockSet).toHaveBeenCalledWith('guide.source', 'https://example.com', 'user');
  });

  it('calls ConfigManager.set with project scope when --project is bare (same as no flags)', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'set', 'guide.source', 'https://example.com', '--project']);

    expect(mockSet).toHaveBeenCalledWith('guide.source', 'https://example.com', 'project');
  });

  it('calls ConfigManager.set with project scope when --project is an existing directory', async () => {
    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'config', 'set', 'guide.source', 'local',
      '--project', process.cwd(),
    ]);

    expect(mockSet).toHaveBeenCalledWith('guide.source', 'local', 'project');
  });

  it('resolves a bare registered project name to its projectPath (not treated as a literal path)', async () => {
    vi.mocked(resolveProjectWorktree).mockResolvedValueOnce({ id: 'proj_001', source: 'flag' });
    vi.mocked(resolveProject).mockResolvedValueOnce({
      id: 'proj_001',
      name: 'gate-walkthrough',
      projectPath: '/real/registered/path',
    } as never);

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'config', 'set', 'workflow.review_enabled', 'true',
      '--project', 'gate-walkthrough',
    ]);

    const { ConfigManager } = await import('@context-forge/core/node');
    expect(vi.mocked(ConfigManager)).toHaveBeenCalledWith('/real/registered/path');
    expect(mockSet).toHaveBeenCalledWith('workflow.review_enabled', true, 'project');
  });

  it('rejects --project and --global together as mutually exclusive, without calling set', async () => {
    const program = createProgram();
    await expect(
      program.parseAsync([
        'node', 'cf', 'config', 'set', 'guide.source', 'x',
        '--project', 'other-project', '--global',
      ])
    ).rejects.toThrow();

    expect(mockSet).not.toHaveBeenCalled();
  });

  it('coerces boolean values', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'set', 'some.flag', 'true']);

    expect(mockSet).toHaveBeenCalledWith('some.flag', true, 'project');
  });

  it('keeps an all-digit value a string for a string-typed key (YYYYMMDD date)', async () => {
    // Regression: the shell strips quotes, so a YYYYMMDD date reaches the CLI as a
    // bare digit string. Blindly Number()-coercing it made ConfigManager.set reject
    // it against the string-typed key. Coercion must consult the declared type.
    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'config', 'set', 'workflow.review_gate_effective_date', '20260706',
    ]);

    expect(mockSet).toHaveBeenCalledWith('workflow.review_gate_effective_date', '20260706', 'project');
  });

  it('prints success message', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'set', 'k', 'v']);

    const output = vi.mocked(console.log).mock.calls[0]?.[0] as string;
    expect(output).toContain('Set k = v');
  });
});

describe('cf config get (regression: CWD resolution unchanged)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('still resolves from CWD with no --project flag', async () => {
    mockGet.mockResolvedValue({
      key: 'guide.source',
      value: '',
      source: 'default',
      description: '',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'get', 'guide.source']);

    const { ConfigManager } = await import('@context-forge/core/node');
    expect(vi.mocked(ConfigManager)).toHaveBeenCalledWith(undefined);
    expect(mockGet).toHaveBeenCalledWith('guide.source');
  });
});

describe('cf config unset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('calls ConfigManager.delete with project scope by default (no flags)', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'unset', 'guide.source']);

    expect(mockDelete).toHaveBeenCalledWith('guide.source', 'project');
  });

  it('calls ConfigManager.delete with user scope when --global is passed', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'unset', 'guide.source', '--global']);

    expect(mockDelete).toHaveBeenCalledWith('guide.source', 'user');
  });

  it('rejects --project <id> and --global together as mutually exclusive', async () => {
    const program = createProgram();
    await expect(
      program.parseAsync([
        'node', 'cf', 'config', 'unset', 'guide.source',
        '--project', 'other-project', '--global',
      ])
    ).rejects.toThrow();

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('exits 0 with a neutral message when the key is not present at the target scope (no-op)', async () => {
    mockDelete.mockResolvedValue(undefined);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'unset', 'guide.source']);

    expect(mockDelete).toHaveBeenCalledWith('guide.source', 'project');
    const output = vi.mocked(console.log).mock.calls[0]?.[0] as string;
    expect(output).toContain('Unset guide.source');
  });

  it('propagates an error for an unknown key, same as get/set', async () => {
    mockDelete.mockRejectedValue(new Error('Unknown config key: "no_such_key"'));
    const handleErrorSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const program = createProgram();
    await expect(
      program.parseAsync(['node', 'cf', 'config', 'unset', 'no_such_key'])
    ).rejects.toThrow();

    handleErrorSpy.mockRestore();
  });
});

describe('cf config migrate-personal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('moves a key absent from the personal file: writes personal, deletes shared, reports moved', async () => {
    mockGetRawProjectFileValues.mockResolvedValue({ personal: undefined, shared: 'legacy/value' });
    mockSet.mockResolvedValue(undefined);
    mockDeleteFromSharedProjectFile.mockResolvedValue(undefined);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'migrate-personal', '--project', process.cwd()]);

    expect(mockSet).toHaveBeenCalledWith('git.integration_branch', 'legacy/value', 'project');
    expect(mockDeleteFromSharedProjectFile).toHaveBeenCalledWith('git.integration_branch');
    // Regression: deleting a personal key via the auto-routed delete('project') targets
    // the personal file, not the shared one — migrate-personal must use the dedicated
    // shared-file-only deletion instead, or it silently wipes the value it just wrote.
    expect(mockDelete).not.toHaveBeenCalled();

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Moved 1 personal key');
    expect(output).toContain('git.integration_branch');
  });

  it('identical values in both files: deletes shared copy only, reports moved', async () => {
    mockGetRawProjectFileValues.mockResolvedValue({ personal: 'a', shared: 'a' });
    mockDeleteFromSharedProjectFile.mockResolvedValue(undefined);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'migrate-personal', '--project', process.cwd()]);

    expect(mockSet).not.toHaveBeenCalled();
    expect(mockDeleteFromSharedProjectFile).toHaveBeenCalledWith('git.integration_branch');
    expect(mockDelete).not.toHaveBeenCalled();

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Moved 1 personal key');
  });

  it('different values in both files: skips both, reports "skipped (personal value already set)"', async () => {
    mockGetRawProjectFileValues.mockResolvedValue({ personal: 'b', shared: 'a' });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'migrate-personal', '--project', process.cwd()]);

    expect(mockSet).not.toHaveBeenCalled();
    expect(mockDeleteFromSharedProjectFile).not.toHaveBeenCalled();

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('skipped (personal value already set)');
  });

  it('no personal keys present in the shared file: reports the no-op message, modifies nothing', async () => {
    mockGetRawProjectFileValues.mockResolvedValue({ personal: undefined, shared: undefined });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'migrate-personal', '--project', process.cwd()]);

    expect(mockSet).not.toHaveBeenCalled();
    expect(mockDeleteFromSharedProjectFile).not.toHaveBeenCalled();

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('No personal keys found in the shared config file.');
  });

  it('is idempotent: a second run after a successful move is a no-op', async () => {
    // First run: moved. Second run: personal now has it, shared no longer does.
    mockGetRawProjectFileValues.mockResolvedValueOnce({ personal: undefined, shared: 'legacy/value' });
    mockSet.mockResolvedValue(undefined);
    mockDeleteFromSharedProjectFile.mockResolvedValue(undefined);

    const program1 = createProgram();
    await program1.parseAsync(['node', 'cf', 'config', 'migrate-personal', '--project', process.cwd()]);
    expect(mockSet).toHaveBeenCalledTimes(1);
    expect(mockDeleteFromSharedProjectFile).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    mockGetRawProjectFileValues.mockResolvedValueOnce({ personal: 'legacy/value', shared: undefined });

    const program2 = createProgram();
    await program2.parseAsync(['node', 'cf', 'config', 'migrate-personal', '--project', process.cwd()]);

    expect(mockSet).not.toHaveBeenCalled();
    expect(mockDeleteFromSharedProjectFile).not.toHaveBeenCalled();
    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('No personal keys found in the shared config file.');
  });

  it('a per-key failure is reported and does not abort the run', async () => {
    mockGetRawProjectFileValues.mockResolvedValue({ personal: undefined, shared: 'legacy/value' });
    mockSet.mockRejectedValue(new Error('disk full'));

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'migrate-personal', '--project', process.cwd()]);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('git.integration_branch: failed (disk full)');
  });
});
