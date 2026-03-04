import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerFutureCommand } from '../../src/commands/future.js';

const mockGetById = vi.fn();
const mockCollect = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getById: mockGetById,
  })),
  FutureWorkCollector: vi.fn().mockImplementation(() => ({
    collect: mockCollect,
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ value: '' }),
  })),
}));

const sampleProject = {
  id: 'proj_001',
  name: 'test-project',
  projectPath: '/tmp/test',
};

const sampleResult = {
  projectPath: '/tmp/test',
  groups: [
    {
      initiativeIndex: 160,
      initiativeName: 'Project Workflow System',
      sourceFile: '160-slices.project-workflow-system.md',
      items: [
        { index: 170, name: 'CLI Enhancement', done: false },
        { index: 171, name: 'Docs Update', done: true },
      ],
      totalItems: 2,
      pendingItems: 1,
      completedItems: 1,
    },
  ],
  totalItems: 2,
  pendingItems: 1,
  completedItems: 1,
  markdown: '',
};

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerFutureCommand(program);
  return program;
}

describe('cf future', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('renders groups with item names and status', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockCollect.mockResolvedValue(sampleResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'future', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Project Workflow System');
    expect(output).toContain('CLI Enhancement');
    expect(output).toContain('Docs Update');
    expect(output).toContain('2 items');
  });

  it('outputs JSON with --json flag', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockCollect.mockResolvedValue(sampleResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'future', '--project', 'proj_001', '--json']);

    const raw = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.totalItems).toBe(2);
  });

  it('passes status filter to collector', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockCollect.mockResolvedValue({ ...sampleResult, groups: [] });

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'future', '--project', 'proj_001', '--status', 'pending',
    ]);

    expect(mockCollect).toHaveBeenCalledWith('/tmp/test', 'pending');
  });
});
