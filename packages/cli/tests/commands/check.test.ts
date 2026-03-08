import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerCheckCommand } from '../../src/commands/check.js';

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockCheck = vi.fn();
const mockFix = vi.fn();
const mockConfigGet = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
  })),
  ArtifactIntrospector: vi.fn(),
  ConsistencyChecker: vi.fn().mockImplementation(() => ({
    check: mockCheck,
    fix: mockFix,
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: mockConfigGet,
  })),
}));

const sampleProject = {
  id: 'proj_001',
  name: 'test-project',
  fileSlice: '100-slice.auth',
  fileTasks: '100-tasks.auth',
  projectPath: '/tmp/test',
};

const noFindingsResult = {
  projectPath: '/tmp/test',
  findings: [],
  totalFindings: 0,
  errors: 0,
  warnings: 0,
  infos: 0,
  summary: 'No inconsistencies found',
};

const findingsResult = {
  projectPath: '/tmp/test',
  findings: [
    {
      rule: 'task-vs-plan',
      severity: 'warning',
      location: '/tmp/test/plan.md',
      description: 'Tasks complete but slice unchecked in plan',
      suggestedFix: 'Check the slice plan entry',
      fixable: true,
    },
    {
      rule: 'missing-artifact',
      severity: 'info',
      location: '/tmp/test/tasks.md',
      description: 'No matching slice plan entry',
      suggestedFix: 'Add an entry',
      fixable: false,
    },
  ],
  totalFindings: 2,
  errors: 0,
  warnings: 1,
  infos: 1,
  summary: '2 findings: 1 warning, 1 info',
};

const fixResult = {
  ...findingsResult,
  fixed: 1,
  fixLog: [
    { rule: 'task-vs-plan', action: 'update-checkbox', filePath: '/tmp/test/plan.md', before: '[ ]', after: '[x]' },
  ],
  fixErrors: [],
};

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerCheckCommand(program);
  return program;
}

describe('cf check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    mockConfigGet.mockResolvedValue({ value: false, source: 'default' });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('shows clean message when no findings', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockCheck.mockResolvedValue(noFindingsResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('No inconsistencies found');
  });

  it('shows findings with severity icons', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockCheck.mockResolvedValue(findingsResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('⚠');
    expect(output).toContain('ℹ');
    expect(output).toContain('Tasks complete but slice unchecked');
    expect(output).toContain('2 findings');
  });

  it('shows fix results with before/after when --fix used', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockFix.mockResolvedValue(fixResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_001', '--fix']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('fix mode');
    expect(output).toContain('[ ]');
    expect(output).toContain('[x]');
    expect(output).toContain('Fixed 1 of 2');
  });

  it('outputs valid JSON with --json flag', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockCheck.mockResolvedValue(findingsResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_001', '--json']);

    const raw = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.totalFindings).toBe(2);
    expect(parsed.findings).toHaveLength(2);
    expect(parsed.summary).toContain('2 findings');
  });

  it('resolves project correctly', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockCheck.mockResolvedValue(noFindingsResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_001']);

    expect(mockGetById).toHaveBeenCalledWith('proj_001');
  });
});
