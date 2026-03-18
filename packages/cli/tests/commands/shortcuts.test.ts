import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerProjectCommand, projectSetAction, projectGetAction, buildSettableFieldsHelp } from '../../src/commands/project.js';
import { handleError } from '../../src/utils/errors.js';

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockUpdate = vi.fn();
const mockResolveFileByIndex = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
    update: mockUpdate,
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ value: '' }),
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

/** Create a program with top-level set/get shortcuts matching index.ts wiring. */
function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerProjectCommand(program);

  program
    .command('set <field> <value>')
    .description('Set a field on the active project (shortcut for cf project set)')
    .option('--project <name|id>', 'Project name or ID (overrides default)')
    .action(async (field: string, val: string, opts: { project?: string }) => {
      try {
        await projectSetAction(field, val, opts);
      } catch (err) {
        handleError(err);
      }
    });

  program
    .command('get')
    .description('Show details for the active project (shortcut for cf project get)')
    .option('--json', 'Output as JSON')
    .option('--project <name|id>', 'Project name or ID (overrides default)')
    .action(async (opts: { json?: boolean; project?: string }) => {
      try {
        await projectGetAction(opts);
      } catch (err) {
        handleError(err);
      }
    });

  return program;
}

describe('buildSettableFieldsHelp', () => {
  it('includes field names and aliases grouped by category', () => {
    const help = buildSettableFieldsHelp();
    expect(help).toContain('Settable fields:');
    expect(help).toContain('Identity');
    expect(help).toContain('Artifacts');
    expect(help).toContain('Workflow');
    expect(help).toContain('Custom');
    // Metadata fields are all readonly, should not appear
    expect(help).not.toContain('Metadata');
    // Check aliases are shown
    expect(help).toContain('(phase)');
    expect(help).toContain('(arch)');
    expect(help).toContain('(slice)');
    expect(help).toContain('(path)');
    expect(help).toContain('(events)');
    expect(help).toContain('(notes)');
    expect(help).toContain('(tools)');
    // Check readonly fields are excluded
    expect(help).not.toContain('createdAt');
    expect(help).not.toContain('updatedAt');
    expect(help).not.toMatch(/\bid\b.*Auto-generated/);
  });
});

describe('cf set (top-level shortcut)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/test');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('sets a field via cf set', async () => {
    mockGetById.mockResolvedValue(sampleProject);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'set', 'fileSlice', '200-slice.new']);

    expect(mockUpdate).toHaveBeenCalledWith('proj_001', { fileSlice: '200-slice.new' });
  });

  it('resolves phase shorthand via cf set', async () => {
    mockGetById.mockResolvedValue(sampleProject);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'set', 'phase', '4']);

    expect(mockUpdate).toHaveBeenCalledWith('proj_001', {
      developmentPhase: 'Phase 4: Slice Design',
      instruction: 'Phase 4: Slice Design',
    });
  });

  it('rejects unknown fields', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'set', 'bogus', 'val']);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('Unknown field'),
    );
  });

  it('sets customData.recentEvents via cf set events', async () => {
    mockGetById.mockResolvedValue({ ...sampleProject, customData: { additionalNotes: 'keep me' } });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'set', 'events', 'state summary']);

    expect(mockUpdate).toHaveBeenCalledWith('proj_001', {
      customData: { additionalNotes: 'keep me', recentEvents: 'state summary' },
    });
  });

  it('sets customData.additionalNotes via cf set notes', async () => {
    mockGetById.mockResolvedValue(sampleProject);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'set', 'notes', 'phase notes']);

    expect(mockUpdate).toHaveBeenCalledWith('proj_001', {
      customData: { additionalNotes: 'phase notes' },
    });
  });

  it('sets customData.availableTools via cf set tools', async () => {
    mockGetById.mockResolvedValue(sampleProject);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'set', 'tools', 'electron, mcp']);

    expect(mockUpdate).toHaveBeenCalledWith('proj_001', {
      customData: { availableTools: 'electron, mcp' },
    });
  });
});

describe('cf get (top-level shortcut)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/test');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('displays project details via cf get', async () => {
    mockGetById.mockResolvedValue(sampleProject);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'get']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const joined = calls.join('\n');
    expect(joined).toContain('test-project');
    expect(joined).toContain('Identity');
  });

  it('displays Custom group with customData fields', async () => {
    mockGetById.mockResolvedValue({
      ...sampleProject,
      customData: { recentEvents: 'slice 173 started', availableTools: 'electron, mcp' },
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'get']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const joined = calls.join('\n');
    expect(joined).toContain('Custom');
    expect(joined).toContain('slice 173 started');
    expect(joined).toContain('electron, mcp');
  });

  it('outputs JSON via cf get --json', async () => {
    mockGetById.mockResolvedValue(sampleProject);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'get', '--json']);

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.id).toBe('proj_001');
  });
});

describe('cf set index resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    mockGetById.mockResolvedValue(sampleProject);
    vi.spyOn(process, 'cwd').mockReturnValue('/tmp/test');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('resolves numeric value for artifact field via resolveFileByIndex', async () => {
    mockResolveFileByIndex.mockReturnValue('171-slice.project-schema');

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'set', 'slice', '171']);

    expect(mockResolveFileByIndex).toHaveBeenCalledWith('/tmp/test', 'fileSlice', '171');
    expect(mockUpdate).toHaveBeenCalledWith('proj_001', { fileSlice: '171-slice.project-schema' });
  });

  it('passes through non-numeric values without index resolution', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'set', 'slice', 'some-name']);

    expect(mockResolveFileByIndex).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith('proj_001', { fileSlice: 'some-name' });
  });

  it('shows error when index resolution fails', async () => {
    mockResolveFileByIndex.mockImplementation(() => {
      throw new Error("No file matching index '999' for field 'fileSlice'");
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'set', 'slice', '999']);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('No file matching index'),
    );
  });

  it('does not trigger index resolution for non-artifact fields with numeric values', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'set', 'name', '42']);

    expect(mockResolveFileByIndex).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith('proj_001', { name: '42' });
  });
});
