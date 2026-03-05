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
    get: vi.fn().mockResolvedValue({ value: 'proj_001' }),
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

  it('renders compact table with Name/Path/Slice/Default columns', async () => {
    mockGetAll.mockResolvedValue([sampleProject]);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'project', 'list']);

    const output = vi.mocked(console.log).mock.calls[0]?.[0] as string;
    expect(output).toContain('test-project');
    expect(output).toContain('100-slice.auth');
    expect(output).toContain('Default');
    expect(output).toContain('●');
  });

  it('shortens path with ~', async () => {
    const homeProject = { ...sampleProject, projectPath: `${process.env.HOME}/repos/test` };
    mockGetAll.mockResolvedValue([homeProject]);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'project', 'list']);

    const output = vi.mocked(console.log).mock.calls[0]?.[0] as string;
    expect(output).toContain('~/repos/test');
  });

  it('outputs JSON with --json flag including isDefault', async () => {
    mockGetAll.mockResolvedValue([sampleProject]);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'project', 'list', '--json']);

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('proj_001');
    expect(parsed[0].isDefault).toBe(true);
  });
});

describe('cf project get', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
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

  it('errors for invalid project name or ID', async () => {
    mockGetAll.mockResolvedValue([sampleProject]);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'project', 'get', '--project', 'bad-id']);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('not found'),
    );
  });
});

describe('cf project set', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
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

  it('rejects unknown fields with --schema hint', async () => {
    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'set', 'foobar', 'val',
      '--project', 'proj_001',
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Unknown field'),
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('--schema'),
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

  it('resolves alias "phase" to developmentPhase', async () => {
    mockGetById.mockResolvedValue(sampleProject);

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'set', 'phase', 'Phase 4: Slice Design',
      '--project', 'proj_001',
    ]);

    expect(mockUpdate).toHaveBeenCalledWith('proj_001', {
      developmentPhase: 'Phase 4: Slice Design',
    });
  });

  it('resolves phase number to full phase string', async () => {
    mockGetById.mockResolvedValue(sampleProject);

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'set', 'phase', '4',
      '--project', 'proj_001',
    ]);

    expect(mockUpdate).toHaveBeenCalledWith('proj_001', {
      developmentPhase: 'Phase 4: Slice Design',
    });
  });

  it('resolves phase short name', async () => {
    mockGetById.mockResolvedValue(sampleProject);

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'set', 'phase', 'implementation',
      '--project', 'proj_001',
    ]);

    expect(mockUpdate).toHaveBeenCalledWith('proj_001', {
      developmentPhase: 'Phase 6: Implementation',
    });
  });

  it('resolves case-insensitive field names', async () => {
    mockGetById.mockResolvedValue(sampleProject);

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'set', 'DevelopmentPhase', 'Phase 6: Implementation',
      '--project', 'proj_001',
    ]);

    expect(mockUpdate).toHaveBeenCalledWith('proj_001', {
      developmentPhase: 'Phase 6: Implementation',
    });
  });

  it('resolves artifact alias "arch" to fileArch', async () => {
    mockGetById.mockResolvedValue(sampleProject);

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'set', 'arch', 'some/path.md',
      '--project', 'proj_001',
    ]);

    expect(mockUpdate).toHaveBeenCalledWith('proj_001', {
      fileArch: 'some/path.md',
    });
  });

  it('rejects invalid enum value with allowed values', async () => {
    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'set', 'workType', 'invalid',
      '--project', 'proj_001',
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Invalid value'),
    );
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('start'),
    );
  });

  it('rejects setting readonly field', async () => {
    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'set', 'id', 'new-id',
      '--project', 'proj_001',
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('read-only'),
    );
  });
});
