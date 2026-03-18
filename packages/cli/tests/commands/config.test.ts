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
