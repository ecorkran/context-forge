import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerArchCommand } from '../../src/commands/arch.js';
import type { ProjectModel } from '@context-forge/core';

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockBuildModel = vi.fn();

const mockMergeProjectModels = vi.fn();

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
  extractSliceIndex: vi.fn((v: string) => {
    const m = /^(\d+)-/.exec(v ?? '');
    return m ? parseInt(m[1], 10) : null;
  }),
}));

const sampleProject = {
  id: 'proj_001',
  name: 'test-project',
  template: 'default',
  fileSlice: '165-slice.workflow.md',
  fileTasks: '165-tasks.workflow.md',
  instruction: 'implementation',
  projectPath: '/tmp/test',
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

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerArchCommand(program);
  return program;
}

describe('cf arch list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('renders table with initiative data and progress counts', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockBuildModel.mockResolvedValue(sampleModel);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'arch', 'list', '--project', 'proj_001']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('Architecture Initiatives');
    expect(output).toContain('Core System');
    expect(output).toContain('Workflow System');
    expect(output).toContain('1/2'); // progress counts
  });

  it('marks active initiative', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockBuildModel.mockResolvedValue(sampleModel);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'arch', 'list', '--project', 'proj_001']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    // 165 is in the 160 initiative → active marker
    expect(output).toContain('active');
  });

  it('outputs structured JSON with --json flag', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockBuildModel.mockResolvedValue(sampleModel);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'arch', 'list', '--json', '--project', 'proj_001']);

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
    await program.parseAsync(['node', 'cf', 'arch', 'list', '--project', 'proj_001']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('No initiatives found');
  });

  it('filters initiatives by worktree index range for non-default worktree', async () => {
    const projectWithWt = {
      ...sampleProject,
      worktrees: [
        { id: 'wt_default', name: 'default', indexRange: [100, 799] as [number, number], worktreePath: '/repos/main' },
        { id: 'wt_wf', name: 'workflow', indexRange: [160, 199] as [number, number], worktreePath: '/repos/workflow' },
      ],
    };
    mockGetAll.mockResolvedValue([projectWithWt]);
    mockGetById.mockResolvedValue(projectWithWt);
    mockBuildModel.mockResolvedValue(sampleModel);
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/workflow');

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'arch', 'list']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('Workflow System');
    expect(output).not.toContain('Core System');
  });

  it('shows all initiatives from default worktree', async () => {
    const projectWithWt = {
      ...sampleProject,
      worktrees: [
        { id: 'wt_default', name: 'default', indexRange: [100, 799] as [number, number], worktreePath: '/repos/main' },
        { id: 'wt_wf', name: 'workflow', indexRange: [160, 199] as [number, number], worktreePath: '/repos/workflow' },
      ],
    };
    mockGetAll.mockResolvedValue([projectWithWt]);
    mockGetById.mockResolvedValue(projectWithWt);
    mockBuildModel.mockResolvedValue(sampleModel);
    vi.spyOn(process, 'cwd').mockReturnValue('/repos/main');

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'arch', 'list']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('Core System');
    expect(output).toContain('Workflow System');
  });

  it('shows all initiatives when no worktrees exist (regression)', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockBuildModel.mockResolvedValue(sampleModel);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'arch', 'list', '--project', 'proj_001']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('Core System');
    expect(output).toContain('Workflow System');
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
    await program.parseAsync(['node', 'cf', 'arch', 'list', '--all']);

    // mergeProjectModels should have been called
    expect(mockMergeProjectModels).toHaveBeenCalled();

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('Core System');
    expect(output).toContain('Workflow System');
    expect(output).toContain('API Layer');
  });

  it('--all without worktrees works (single path, no aggregation)', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockBuildModel.mockResolvedValue(sampleModel);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'arch', 'list', '--all', '--project', 'proj_001']);

    // No worktrees → falls through to single-path
    expect(mockMergeProjectModels).not.toHaveBeenCalled();

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('Core System');
  });
});
