import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerInitCommand } from '../../src/commands/init.js';

const mockGetAll = vi.fn();
const mockCreate = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    create: mockCreate,
  })),
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
    mockCreate.mockResolvedValue({
      id: 'project_new_001',
      name: 'test-dir',
    });
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
        instruction: 'implementation',
      }),
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('Initialized project'),
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
});
