import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerListCommand } from '../../src/commands/list.js';
import type { ProjectModel } from '@context-forge/core';
import { normalizeArtifactValue } from '../../../core/src/schema/normalizeArtifactValue.js';

// ──────────────────────────────────────────────────
// Shared mocks
// ──────────────────────────────────────────────────

const { mockGetAll, mockGetById, mockParseTaskFile, mockFindProjectByCwd } = vi.hoisted(() => ({
  mockGetAll: vi.fn(),
  mockGetById: vi.fn(),
  mockParseTaskFile: vi.fn(),
  mockFindProjectByCwd: vi.fn(),
}));

const mockBuildModel = vi.fn();
const mockMergeProjectModels = vi.fn();
const mockResolveInitiativePlanPath = vi.fn().mockResolvedValue(null);
const mockParseSlicePlanIntrospector = vi.fn();
const mockDetectDocuments = vi.fn();
// Introspector-instance parseTaskFile/parseFrontmatter, used by the derived-status
// resolution added in slice 911 — default to "nothing found" so tests that don't
// care about derived status still see a clean not-started/checkbox-only result.
const mockIntrospectorParseTaskFile = vi.fn().mockResolvedValue({
  filePath: '', items: [], totalTasks: 0, completedTasks: 0, inferredStatus: 'not-started',
});
const mockIntrospectorParseFrontmatter = vi.fn().mockResolvedValue({ filePath: '', found: false, data: {} });

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ value: 'proj_001' }),
  })),
  buildModel: (...args: unknown[]) => mockBuildModel(...args),
  mergeProjectModels: (...args: unknown[]) => mockMergeProjectModels(...args),
  // Return null so archListAction falls through to the buildModel-driven path
  // that these tests exercise (the initiative-plan-file path is covered elsewhere).
  resolveInitiativePlanPath: (...args: unknown[]) => mockResolveInitiativePlanPath(...args),
  extractSliceIndex: vi.fn((v: string) => {
    const m = /^(\d+)-/.exec(v ?? '');
    return m ? parseInt(m[1], 10) : null;
  }),
  normalizeArtifactValue: (value: string) => normalizeArtifactValue(value),
  resolveArtifactPath: vi.fn((field: string, stem: string) => {
    const dirs: Record<string, string> = {
      fileSlicePlan: 'project-documents/user/architecture',
      fileTasks: 'project-documents/user/tasks',
    };
    const dir = dirs[field];
    const normalized = normalizeArtifactValue(stem);
    return dir ? `${dir}/${normalized}.md` : null;
  }),
  ArtifactIntrospector: vi.fn().mockImplementation(() => ({
    parseSlicePlan: mockParseSlicePlanIntrospector,
    detectDocuments: mockDetectDocuments,
    parseTaskFile: mockIntrospectorParseTaskFile,
    parseFrontmatter: mockIntrospectorParseFrontmatter,
  })),
  parseSlicePlan: vi.fn(),
  parseTaskFile: (...args: unknown[]) => mockParseTaskFile(...args),
}));

vi.mock('../../src/utils/project.js', () => ({
  resolveProjectWorktree: vi.fn().mockResolvedValue({ id: 'proj_001', worktreeId: undefined }),
  findProjectByCwd: (...args: unknown[]) => mockFindProjectByCwd(...args),
}));

vi.mock('@context-forge/core', async () => {
  const actual = await vi.importActual('@context-forge/core');
  return {
    ...actual,
    resolveProject: vi.fn().mockImplementation(async (_store: unknown, id: string) => {
      return mockGetById(id);
    }),
  };
});

// ──────────────────────────────────────────────────
// Sample data
// ──────────────────────────────────────────────────

const sampleProject = {
  id: 'proj_001',
  name: 'test-project',
  template: 'default',
  fileSlice: '165-slice.workflow.md',
  fileTasks: '165-tasks.workflow.md',
  instruction: 'implementation',
  projectPath: '/tmp/test',
  fileSlicePlan: '100-slices.test',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-03-04T00:00:00Z',
};

const sampleModel: Partial<ProjectModel> = {
  name: 'test-project',
  description: '',
  initiatives: {
    '100': {
      name: 'Core System',
      slices: [
        { index: '100', name: 'Auth', status: 'complete' },
        { index: '101', name: 'Users', status: 'in-progress' },
      ],
      features: [],
      arch: { index: '100', name: 'core-system', status: 'active' },
      slicePlan: {
        index: '100', name: 'core-system', status: 'active',
        futureWork: [], entries: [],
      },
    },
    '160': {
      name: 'Workflow System',
      slices: [
        { index: '160', name: 'Foundation', status: 'complete' },
        { index: '165', name: 'Navigator', status: 'in-progress' },
      ],
      features: [],
      arch: { index: '160', name: 'workflow-system', status: 'active' },
    },
  },
};

const samplePlanResult = {
  filePath: '/tmp/test/project-documents/user/architecture/100-slices.test.md',
  entries: [
    { index: 100, name: 'Auth Feature', status: 'complete', isChecked: true, lineIndex: 0 },
    { index: 101, name: 'Billing Feature', status: 'not-started', isChecked: false, lineIndex: 0 },
    { index: 102, name: 'Dashboard', status: 'not-started', isChecked: false, lineIndex: 0 },
  ],
  totalSlices: 3,
  completedSlices: 1,
};

const sampleTaskResult = {
  filePath: '/tmp/test/project-documents/user/tasks/165-tasks.workflow.md',
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
  registerListCommand(program);
  return program;
}

// ──────────────────────────────────────────────────
// Tests: cf list projects
// ──────────────────────────────────────────────────

describe('cf list projects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    mockFindProjectByCwd.mockResolvedValue({ project: sampleProject });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  it('renders project table', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'list', 'projects']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('test-project');
  });

  it('outputs JSON with --json flag', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'list', 'projects', '--json']);

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe('test-project');
  });
});

// ──────────────────────────────────────────────────
// Tests: cf list initiatives
// ──────────────────────────────────────────────────

describe('cf list initiatives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    // No initiative-plan file → exercise the buildModel-driven fallback path.
    mockResolveInitiativePlanPath.mockResolvedValue(null);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('renders table with initiative data and progress counts', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockBuildModel.mockResolvedValue(sampleModel);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'list', 'initiatives', '--project', 'proj_001']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('Architecture Initiatives');
    expect(output).toContain('Core System');
    expect(output).toContain('Workflow System');
    expect(output).toContain('1/2');
  });

  it('outputs structured JSON with --json flag', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockBuildModel.mockResolvedValue(sampleModel);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'list', 'initiatives', '--json', '--project', 'proj_001']);

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].name).toBe('Core System');
    expect(parsed[1].isActive).toBe(true);
  });

  it('handles empty model with no initiatives', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockBuildModel.mockResolvedValue({ ...sampleModel, initiatives: {} });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'list', 'initiatives', '--project', 'proj_001']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('No initiatives found');
  });

  it('--all aggregates initiatives from all worktree paths', async () => {
    const projectWithWt = {
      ...sampleProject,
      worktrees: [
        { id: 'wt_default', name: 'default', indexRange: [100, 799] as [number, number], worktreePath: '/repos/main' },
        { id: 'wt_wf', name: 'workflow', indexRange: [160, 199] as [number, number], worktreePath: '/repos/workflow' },
      ],
    };
    mockGetAll.mockResolvedValue([projectWithWt]);
    mockGetById.mockResolvedValue(projectWithWt);

    const mergedModel = {
      ...sampleModel,
      initiatives: {
        ...sampleModel.initiatives,
        '300': {
          name: 'API Layer',
          slices: [],
          features: [],
          arch: { index: '300', name: 'api-layer', status: 'active' },
        },
      },
    };
    mockBuildModel.mockResolvedValue(sampleModel);
    mockMergeProjectModels.mockReturnValue(mergedModel);
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/main');

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'list', 'initiatives', '--all']);

    expect(mockMergeProjectModels).toHaveBeenCalled();
    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('Core System');
    expect(output).toContain('API Layer');
  });
});

// ──────────────────────────────────────────────────
// Tests: cf list arch (alias)
// ──────────────────────────────────────────────────

describe('cf list arch (alias)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    // No initiative-plan file → exercise the buildModel-driven fallback path.
    mockResolveInitiativePlanPath.mockResolvedValue(null);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('produces same output as cf list initiatives', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockBuildModel.mockResolvedValue(sampleModel);

    // Run cf list initiatives
    const program1 = createProgram();
    await program1.parseAsync(['node', 'cf', 'list', 'initiatives', '--project', 'proj_001']);
    const initiativesOutput = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');

    // Reset and run cf list arch
    vi.mocked(console.log).mockClear();
    mockGetById.mockResolvedValue(sampleProject);
    mockBuildModel.mockResolvedValue(sampleModel);

    const program2 = createProgram();
    await program2.parseAsync(['node', 'cf', 'list', 'arch', '--project', 'proj_001']);
    const archOutput = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');

    expect(archOutput).toBe(initiativesOutput);
  });
});

// ──────────────────────────────────────────────────
// Tests: cf list slices
// ──────────────────────────────────────────────────

describe('cf list slices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    mockIntrospectorParseTaskFile.mockResolvedValue({
      filePath: '', items: [], totalTasks: 0, completedTasks: 0, inferredStatus: 'not-started',
    });
    mockIntrospectorParseFrontmatter.mockResolvedValue({ filePath: '', found: false, data: {} });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('renders table with correct columns and status indicators', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockParseSlicePlanIntrospector.mockResolvedValue(samplePlanResult);
    mockDetectDocuments.mockResolvedValue({ sliceDesign: 'project-documents/user/slices/100-slice.auth.md', taskFile: null });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'list', 'slices', '--project', 'proj_001']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('Slice Plan');
    expect(output).toContain('Auth Feature');
    expect(output).toContain('complete');
    expect(output).toContain('Billing Feature');
  });

  it('outputs structured JSON with --json flag', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockParseSlicePlanIntrospector.mockResolvedValue(samplePlanResult);
    mockDetectDocuments.mockResolvedValue({ sliceDesign: null, taskFile: null });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'list', 'slices', '--json', '--project', 'proj_001']);

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.slicePlan).toBe('100-slices.test');
    expect(parsed.total).toBe(3);
    expect(parsed.completed).toBe(1);
    expect(parsed.entries).toHaveLength(3);
  });

  it('errors when no fileSlicePlan set', async () => {
    const projectNoPlan = { ...sampleProject, fileSlicePlan: undefined };
    mockGetById.mockResolvedValue(projectNoPlan);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'list', 'slices', '--project', 'proj_001']);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('slice plan'),
    );
  });
});

// ──────────────────────────────────────────────────
// Tests: cf list items
// ──────────────────────────────────────────────────

describe('cf list items', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('renders task items with completion indicators and progress header', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockParseTaskFile.mockResolvedValue(sampleTaskResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'list', 'items', '--project', 'proj_001']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('Tasks:');
    expect(output).toContain('1/3 complete');
    expect(output).toContain('Setup project');
    expect(output).toContain('Implement auth');
  });

  it('outputs JSON with --json flag', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockParseTaskFile.mockResolvedValue(sampleTaskResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'list', 'items', '--json', '--project', 'proj_001']);

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
    await program.parseAsync(['node', 'cf', 'list', 'items', '--project', 'proj_001']);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('task file'),
    );
  });
});

// ──────────────────────────────────────────────────
// Tests: Old commands removed
// ──────────────────────────────────────────────────

describe('old commands removed', () => {
  it('cf arch list is not registered as a subcommand', () => {
    const program = createProgram();
    const archCmd = program.commands.find((c) => c.name() === 'arch');
    // arch should not be a top-level parent command
    expect(archCmd).toBeUndefined();
  });

  it('cf slice list is not registered as a subcommand', () => {
    const program = createProgram();
    const sliceCmd = program.commands.find((c) => c.name() === 'slice');
    expect(sliceCmd).toBeUndefined();
  });

  it('cf tasks list is not registered as a subcommand', () => {
    const program = createProgram();
    const tasksCmd = program.commands.find((c) => c.name() === 'tasks');
    // tasks as a top-level command should not exist (it exists under list)
    expect(tasksCmd).toBeUndefined();
  });
});
