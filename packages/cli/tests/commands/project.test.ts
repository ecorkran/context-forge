import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerProjectCommand } from '../../src/commands/project.js';

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockResolveFileByIndex = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
    update: mockUpdate,
    delete: mockDelete,
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ value: 'proj_001' }),
  })),
  resolveFileByIndex: (...args: unknown[]) => mockResolveFileByIndex(...args),
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

  it('renders table with active project highlighted', async () => {
    mockGetAll.mockResolvedValue([sampleProject]);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'project', 'list']);

    const output = vi.mocked(console.log).mock.calls[0]?.[0] as string;
    expect(output).toContain('test-project');
    expect(output).toContain('100-slice.auth');
    // Active project (resolved via default_project config) has * prefix
    expect(output).toContain('*');
  });

  it('shortens path with ~', async () => {
    const homeProject = { ...sampleProject, projectPath: `${process.env.HOME}/repos/test` };
    mockGetAll.mockResolvedValue([homeProject]);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'project', 'list']);

    const output = vi.mocked(console.log).mock.calls[0]?.[0] as string;
    expect(output).toContain('~/repos/test');
  });

  it('outputs JSON with --json flag including isActive', async () => {
    mockGetAll.mockResolvedValue([sampleProject]);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'project', 'list', '--json']);

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe('proj_001');
    expect(parsed[0].isActive).toBe(true);
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

  it('displays grouped output with group headers', async () => {
    mockGetById.mockResolvedValue(sampleProject);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'project', 'get', '--project', 'proj_001']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const joined = calls.join('\n');
    expect(joined).toContain('Identity');
    expect(joined).toContain('Workflow');
    expect(joined).toContain('test-project');
    expect(joined).toContain('100-slice.auth');
  });

  it('shows artifact fields when populated', async () => {
    const projectWithArtifacts = {
      ...sampleProject,
      fileArch: 'user/architecture/160-arch.md',
    };
    mockGetById.mockResolvedValue(projectWithArtifacts);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'project', 'get', '--project', 'proj_001']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const joined = calls.join('\n');
    expect(joined).toContain('Artifacts');
    expect(joined).toContain('160-arch.md');
  });

  it('shows all groups with unset fields as dim placeholder', async () => {
    const minimalProject = {
      ...sampleProject,
      fileSlice: '',
      fileTasks: '',
      fileArch: undefined,
    };
    mockGetById.mockResolvedValue(minimalProject);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'project', 'get', '--project', 'proj_001']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const joined = calls.join('\n');
    // All groups always appear
    expect(joined).toContain('Artifacts');
    // Unset fields show dim placeholder
    expect(joined).toContain('—');
  });

  it('outputs JSON unchanged with --json flag', async () => {
    mockGetById.mockResolvedValue(sampleProject);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'project', 'get', '--project', 'proj_001', '--json']);

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.id).toBe('proj_001');
    expect(parsed.name).toBe('test-project');
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
    expect(output).toContain('Updated slice');
  });

  it('resolves alias "phase" to developmentPhase and auto-sets instruction', async () => {
    mockGetById.mockResolvedValue(sampleProject);

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'set', 'phase', 'Phase 4: Slice Design',
      '--project', 'proj_001',
    ]);

    expect(mockUpdate).toHaveBeenCalledWith('proj_001', {
      developmentPhase: 'Phase 4: Slice Design',
      instruction: 'Phase 4: Slice Design',
    });
  });

  it('resolves phase number and auto-sets instruction', async () => {
    mockGetById.mockResolvedValue(sampleProject);

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'set', 'phase', '6',
      '--project', 'proj_001',
    ]);

    expect(mockUpdate).toHaveBeenCalledWith('proj_001', {
      developmentPhase: 'Phase 6: Implementation',
      instruction: 'Phase 6: Implementation',
    });
  });

  it('setting instruction directly does not touch developmentPhase', async () => {
    mockGetById.mockResolvedValue(sampleProject);

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'set', 'instruction', 'slice-design',
      '--project', 'proj_001',
    ]);

    expect(mockUpdate).toHaveBeenCalledWith('proj_001', {
      instruction: 'Phase 4: Slice Design',
    });
    // Should NOT include developmentPhase in the update
    const updateArg = mockUpdate.mock.calls[0][1] as Record<string, unknown>;
    expect(updateArg.developmentPhase).toBeUndefined();
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
      instruction: 'Phase 6: Implementation',
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

describe('cf project --schema', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('displays all group headers', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'project', '--schema']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const joined = calls.join('\n');
    expect(joined).toContain('Identity');
    expect(joined).toContain('Artifacts');
    expect(joined).toContain('Workflow');
    expect(joined).toContain('Metadata');
  });

  it('displays alias information for aliased fields', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'project', '--schema']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const joined = calls.join('\n');
    // Aliases appear as column values in the table
    expect(joined).toContain('phase');
    expect(joined).toContain('arch');
    expect(joined).toContain('path');
  });

  it('displays enum values for enum fields', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'project', '--schema']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const joined = calls.join('\n');
    // Enum values appear in "Allowed values" section at bottom
    expect(joined).toContain('start | continue');
  });
});

describe('cf project set — auto-set fileTasks from fileSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('auto-sets fileTasks when setting fileSlice with matching task file', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    // Auto-set call: resolveFileByIndex(projectPath, 'fileTasks', '200')
    mockResolveFileByIndex.mockReturnValue('200-tasks.new-feature.md');

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'set', 'fileSlice', '200-slice.new-feature.md',
      '--project', 'proj_001',
    ]);

    // First update: fileSlice itself
    expect(mockUpdate).toHaveBeenCalledWith('proj_001', { fileSlice: '200-slice.new-feature.md' });
    // Second update: auto-set fileTasks
    expect(mockUpdate).toHaveBeenCalledWith('proj_001', { fileTasks: '200-tasks.new-feature.md' });
    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('auto-set from slice');
  });

  it('derives fileTasks from slice name when task file does not exist on disk', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockResolveFileByIndex.mockImplementation(() => {
      throw new Error('No file matching index');
    });

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'set', 'fileSlice', '999-slice.no-tasks.md',
      '--project', 'proj_001',
    ]);

    // Two updates: fileSlice + derived fileTasks
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    expect(mockUpdate).toHaveBeenCalledWith('proj_001', { fileSlice: '999-slice.no-tasks.md' });
    expect(mockUpdate).toHaveBeenCalledWith('proj_001', { fileTasks: '999-tasks.no-tasks.md' });
  });

  it('does not auto-set fileSlice when setting fileTasks directly', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockResolveFileByIndex.mockReturnValue(null);

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'set', 'fileTasks', '200-tasks.new.md',
      '--project', 'proj_001',
    ]);

    // Only one update call (for fileTasks itself)
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith('proj_001', { fileTasks: '200-tasks.new.md' });
  });
});

describe('cf project rm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('deletes project with --yes flag using positional name', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockDelete.mockResolvedValue(undefined);

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'rm', 'test-project', '--yes',
    ]);

    expect(mockDelete).toHaveBeenCalledWith('proj_001');
    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('removed');
  });

  it('deletes project with --yes flag using --project option', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockDelete.mockResolvedValue(undefined);

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'rm', '--project', 'proj_001', '--yes',
    ]);

    expect(mockDelete).toHaveBeenCalledWith('proj_001');
    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('removed');
  });

  it('errors when project not found', async () => {
    mockGetAll.mockResolvedValue([sampleProject]);

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'rm', 'bad-id', '--yes',
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('not found'),
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it('does not delete when project not found by ID', async () => {
    mockGetById.mockResolvedValue(undefined);

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'project', 'rm', '--project', 'proj_001', '--yes',
    ]);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('not found'),
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });
});
