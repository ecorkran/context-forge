import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerNextCommand } from '../../src/commands/next.js';

const mockGetById = vi.fn();
const mockSummarize = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
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
  projectPath: '/tmp/test',
};

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerNextCommand(program);
  return program;
}

describe('cf next', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('shows "Continue current tasks" when tasks remain', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockSummarize.mockResolvedValue({
      currentTasks: { totalTasks: 10, completedTasks: 4, inferredStatus: 'in_progress', summary: '' },
      artifacts: {},
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'next', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Continue current tasks');
    expect(output).toContain('6 of 10');
  });

  it('shows "Advance" when all tasks complete', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockSummarize.mockResolvedValue({
      currentTasks: { totalTasks: 5, completedTasks: 5, inferredStatus: 'complete', summary: '' },
      artifacts: {},
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'next', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Advance');
  });

  it('outputs valid JSON with --json flag', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockSummarize.mockResolvedValue({
      currentTasks: { totalTasks: 3, completedTasks: 1, inferredStatus: 'in_progress', summary: '' },
      artifacts: {},
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'next', '--project', 'proj_001', '--json']);

    const raw = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.recommendation).toBeDefined();
    expect(parsed.slice).toBe('100-slice.auth');
  });
});
