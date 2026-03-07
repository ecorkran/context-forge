import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerTaskCommand } from '../../src/commands/task.js';

const { mockGetAll, mockGetById, mockParseTaskFile } = vi.hoisted(() => ({
  mockGetAll: vi.fn(),
  mockGetById: vi.fn(),
  mockParseTaskFile: vi.fn(),
}));

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ value: 'proj_001' }),
  })),
  resolveArtifactPath: vi.fn((field: string, stem: string) => {
    const dirs: Record<string, string> = {
      fileTasks: 'project-documents/user/tasks',
      fileSlicePlan: 'project-documents/user/architecture',
    };
    const dir = dirs[field];
    return dir ? `${dir}/${stem}.md` : null;
  }),
  extractSliceIndex: vi.fn((v: string) => {
    const m = /^(\d+)-/.exec(v ?? '');
    return m ? parseInt(m[1], 10) : null;
  }),
  parseSlicePlan: vi.fn(),
  parseTaskFile: (...args: unknown[]) => mockParseTaskFile(...args),
}));

const sampleProject = {
  id: 'proj_001',
  name: 'test-project',
  template: 'default',
  fileSlice: '100-slice.auth',
  fileTasks: '100-tasks.auth',
  instruction: 'implementation',
  projectPath: '/tmp/test',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-03-04T00:00:00Z',
};

const sampleTaskResult = {
  filePath: '/tmp/test/project-documents/user/tasks/100-tasks.auth.md',
  items: [
    { name: 'Setup project', done: true },
    { name: 'Implement auth', done: false },
    { name: 'Write tests', done: false },
  ],
  totalTasks: 3,
  completedTasks: 1,
  inferredStatus: 'in-progress' as const,
};

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerTaskCommand(program);
  return program;
}

describe('cf task list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('renders task list with completion indicators and progress header', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockParseTaskFile.mockResolvedValue(sampleTaskResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'task', 'list', '--project', 'proj_001']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('Tasks:');
    expect(output).toContain('1/3 complete');
    expect(output).toContain('Setup project');
    expect(output).toContain('Implement auth');
  });

  it('outputs TaskFileResult with --json flag', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockParseTaskFile.mockResolvedValue(sampleTaskResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'task', 'list', '--json', '--project', 'proj_001']);

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.totalTasks).toBe(3);
    expect(parsed.completedTasks).toBe(1);
    expect(parsed.items).toHaveLength(3);
  });

  it('errors when no fileTasks set', async () => {
    const projectNoTasks = { ...sampleProject, fileTasks: '' };
    mockGetById.mockResolvedValue(projectNoTasks);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'task', 'list', '--project', 'proj_001']);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('task file'),
    );
  });
});
