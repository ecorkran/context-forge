import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerProjectCommand } from '../../src/commands/project.js';

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
    update: mockUpdate,
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ value: 'test-project-id' }),
  })),
}));

const sampleProject = {
  id: 'proj_001',
  name: 'test-project',
  template: 'default',
  fileSlice: '100-slice.auth',
  fileTasks: '100-tasks.auth',
  instruction: 'implementation',
  developmentPhase: 'Phase 6: Implementation',
  workType: 'continue',
  dateProject: '2026-03-04',
  isMonorepo: false,
  projectPath: '/tmp/test',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-03-04T00:00:00Z',
};

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerProjectCommand(program);
  return program;
}

describe('cf project list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  it('renders a table with ID/Name/Path/Slice columns', async () => {
    mockGetAll.mockResolvedValue([sampleProject]);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'project', 'list']);

    const output = vi.mocked(console.log).mock.calls[0]?.[0] as string;
    expect(output).toContain('proj_001');
    expect(output).toContain('test-project');
    expect(output).toContain('/tmp/test');
    expect(output).toContain('100-slice.auth');
  });

  it('outputs JSON with --json flag', async () => {
    mockGetAll.mockResolvedValue([sampleProject]);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'project', 'list', '--json']);

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('proj_001');
  });
});

describe('cf project get', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('displays project fields', async () => {
    mockGetById.mockResolvedValue(sampleProject);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'project', 'get', '--project', 'proj_001']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const joined = calls.join('\n');
    expect(joined).toContain('test-project');
    expect(joined).toContain('100-slice.auth');
  });

  it('errors for invalid project ID', async () => {
    mockGetById.mockResolvedValue(undefined);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'project', 'get', '--project', 'bad-id']);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Project not found'),
    );
  });
});

describe('cf project set', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('calls store.update with correct field and value', async () => {
    mockGetById.mockResolvedValue(sampleProject);

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'set', 'fileSlice', '200-slice.new',
      '--project', 'proj_001',
    ]);

    expect(mockUpdate).toHaveBeenCalledWith('proj_001', { fileSlice: '200-slice.new' });
  });

  it('rejects unknown fields', async () => {
    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'set', 'badField', 'val',
      '--project', 'proj_001',
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Unknown field'),
    );
  });

  it('prints success message', async () => {
    mockGetById.mockResolvedValue(sampleProject);

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'set', 'fileSlice', 'new-slice',
      '--project', 'proj_001',
    ]);

    const output = vi.mocked(console.log).mock.calls[0]?.[0] as string;
    expect(output).toContain('Updated fileSlice');
  });
});
