import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerConfigCommand } from '../../src/commands/config.js';

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
}));

function createProgram(): Command {
  const program = new Command();
  program.exitOverride(); // Throw instead of process.exit
  registerConfigCommand(program);
  return program;
}

describe('cf config list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  it('renders a table with key/value/source columns', async () => {
    mockList.mockResolvedValue([
      { key: 'default_project', value: 'my-project', source: 'user', description: '' },
      { key: 'guide.source', value: 'bundled', source: 'default', description: '' },
    ]);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'list']);

    const output = vi.mocked(console.log).mock.calls[0]?.[0] as string;
    expect(output).toContain('default_project');
    expect(output).toContain('my-project');
    expect(output).toContain('user');
    expect(output).toContain('guide.source');
  });

  it('outputs JSON when --json flag is set', async () => {
    const entries = [
      { key: 'default_project', value: 'proj', source: 'user', description: '' },
    ];
    mockList.mockResolvedValue(entries);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'list', '--json']);

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
      key: 'default_project',
      value: 'my-proj',
      source: 'user',
      description: 'Default project ID',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'config', 'get', 'default_project']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const joined = calls.join('\n');
    expect(joined).toContain('default_project');
    expect(joined).toContain('my-proj');
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
    await program.parseAsync(['node', 'cf', 'config', 'set', 'default_project', 'my-proj']);

    expect(mockSet).toHaveBeenCalledWith('default_project', 'my-proj', 'user');
  });

  it('calls ConfigManager.set with project scope when --project is set', async () => {
    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'config', 'set', 'guide.source', 'local',
      '--project', '/my/project',
    ]);

    expect(mockSet).toHaveBeenCalledWith('guide.source', 'local', 'project');
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
