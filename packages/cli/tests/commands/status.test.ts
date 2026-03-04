import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerStatusCommand } from '../../src/commands/status.js';

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockSummarize = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
  })),
  ArtifactIntrospector: vi.fn().mockImplementation(() => ({
    summarize: mockSummarize,
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ value: '' }),
  })),
}));

const sampleProject = {
  id: 'proj_001',
  name: 'test-project',
  fileSlice: '100-slice.auth',
  fileTasks: '100-tasks.auth',
  developmentPhase: 'Phase 6: Implementation',
  workType: 'continue',
  projectPath: '/tmp/test',
};

const sampleIntrospection = {
  slicePlan: { totalSlices: 10, completedSlices: 7, summary: '7 of 10 done' },
  currentTasks: { totalTasks: 5, completedTasks: 3, inferredStatus: 'in_progress', summary: '' },
  artifacts: { hasSlicePlan: true, hasHLD: false, hasArch: false, hasSpec: false, hasCurrentSliceDesign: true, hasCurrentTaskFile: true },
};

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerStatusCommand(program);
  return program;
}

describe('cf status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('displays project, phase, slice, and task progress', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockSummarize.mockResolvedValue(sampleIntrospection);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'status', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('test-project');
    expect(output).toContain('Phase 6');
    expect(output).toContain('100-slice.auth');
    expect(output).toContain('3/5 tasks');
  });

  it('outputs valid JSON with --json flag', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockSummarize.mockResolvedValue(sampleIntrospection);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'status', '--project', 'proj_001', '--json']);

    const raw = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.project).toBe('test-project');
    expect(parsed.currentTasks.totalTasks).toBe(5);
  });

  it('shows slice plan summary when available', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockSummarize.mockResolvedValue(sampleIntrospection);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'status', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('7/10 slices');
  });

  it('shows resolution source label in terminal output', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockSummarize.mockResolvedValue(sampleIntrospection);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'status', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('--project flag');
  });

  it('includes resolutionSource in JSON output', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockSummarize.mockResolvedValue(sampleIntrospection);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'status', '--project', 'proj_001', '--json']);

    const raw = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.resolutionSource).toBe('flag');
  });
});
