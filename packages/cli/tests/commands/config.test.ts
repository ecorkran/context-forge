import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerConfigCommand } from '../../src/commands/config.js';
import { resolveProject } from '@context-forge/core';
import { resolveProjectWorktree } from '../../src/utils/project.js';
import { UserError } from '../../src/utils/errors.js';

// Mock ConfigManager
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockList = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: mockGet,
    set: mockSet,
    list: mockList,
  })),
  FileProjectStore: vi.fn().mockImplementation(() => ({})),
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

  it('calls ConfigManager.set with user scope by default', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'set', 'guide.source', 'https://example.com']);

    expect(mockSet).toHaveBeenCalledWith('guide.source', 'https://example.com', 'user');
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

  it('coerces boolean values', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'set', 'some.flag', 'true']);

    expect(mockSet).toHaveBeenCalledWith('some.flag', true, 'user');
  });

  it('prints success message', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'set', 'k', 'v']);

    const output = vi.mocked(console.log).mock.calls[0]?.[0] as string;
    expect(output).toContain('Set k = v');
  });
});
