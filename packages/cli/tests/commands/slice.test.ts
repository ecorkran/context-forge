import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerSliceCommand } from '../../src/commands/slice.js';

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockParseSlicePlan = vi.fn();
const mockDetectDocuments = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ value: 'proj_001' }),
  })),
  ArtifactIntrospector: vi.fn().mockImplementation(() => ({
    parseSlicePlan: mockParseSlicePlan,
    detectDocuments: mockDetectDocuments,
  })),
  extractSliceIndex: vi.fn((v: string) => {
    const m = /^(\d+)-/.exec(v ?? '');
    return m ? parseInt(m[1], 10) : null;
  }),
  resolveArtifactPath: vi.fn((field: string, stem: string) => {
    const dirs: Record<string, string> = {
      fileSlicePlan: 'project-documents/user/architecture',
    };
    const dir = dirs[field];
    return dir ? `${dir}/${stem}.md` : null;
  }),
}));

const sampleProject = {
  id: 'proj_001',
  name: 'test-project',
  template: 'default',
  fileSlice: '100-slice.auth.md',
  fileTasks: '100-tasks.auth.md',
  instruction: 'implementation',
  projectPath: '/tmp/test',
  fileSlicePlan: '100-slices.test',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-03-04T00:00:00Z',
};

const samplePlanResult = {
  filePath: '/tmp/test/project-documents/user/architecture/100-slices.test.md',
  entries: [
    { index: 100, name: 'Auth Feature', status: 'complete', isChecked: true },
    { index: 101, name: 'Billing Feature', status: 'not-started', isChecked: false },
    { index: 102, name: 'Dashboard', status: 'not-started', isChecked: false },
  ],
  totalSlices: 3,
  completedSlices: 1,
};

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerSliceCommand(program);
  return program;
}

describe('cf slice list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('renders table with correct columns and status indicators', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockParseSlicePlan.mockResolvedValue(samplePlanResult);
    mockDetectDocuments.mockResolvedValue({ sliceDesign: 'project-documents/user/slices/100-slice.auth.md', taskFile: null, architecture: null, slicePlan: null });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'slice', 'list', '--project', 'proj_001']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('Slice Plan');
    expect(output).toContain('Auth Feature');
    expect(output).toContain('complete');
    expect(output).toContain('Billing Feature');
  });

  it('marks active slice with indicator', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockParseSlicePlan.mockResolvedValue(samplePlanResult);
    mockDetectDocuments.mockResolvedValue({ sliceDesign: null, taskFile: null, architecture: null, slicePlan: null });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'slice', 'list', '--project', 'proj_001']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('active');
  });

  it('marks next candidate when no active match', async () => {
    const projectNoSlice = { ...sampleProject, fileSlice: '' };
    mockGetById.mockResolvedValue(projectNoSlice);
    mockParseSlicePlan.mockResolvedValue(samplePlanResult);
    mockDetectDocuments.mockResolvedValue({ sliceDesign: null, taskFile: null, architecture: null, slicePlan: null });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'slice', 'list', '--project', 'proj_001']);

    const calls = vi.mocked(console.log).mock.calls.map((c) => c[0]);
    const output = calls.join('\n');
    expect(output).toContain('next');
  });

  it('outputs structured JSON with --json flag', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockParseSlicePlan.mockResolvedValue(samplePlanResult);
    mockDetectDocuments.mockResolvedValue({ sliceDesign: null, taskFile: null, architecture: null, slicePlan: null });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'slice', 'list', '--json', '--project', 'proj_001']);

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
    await program.parseAsync(['node', 'cf', 'slice', 'list', '--project', 'proj_001']);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('slice plan'),
    );
  });
});
