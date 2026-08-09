import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerValidateCommand } from '../../src/commands/validate.js';

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockValidateFrontmatterFiles = vi.fn();
const mockUpdateFrontmatterField = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
  })),
  validateFrontmatterFiles: (...args: unknown[]) => mockValidateFrontmatterFiles(...args),
  updateFrontmatterField: (...args: unknown[]) => mockUpdateFrontmatterField(...args),
}));

const sampleProject = {
  id: 'proj_001',
  name: 'test-project',
  fileSlice: '100-slice.auth',
  fileTasks: '100-tasks.auth',
  projectPath: '/tmp/test',
};

const cleanResult = { findings: [], filesChecked: 3 };

const statusFinding = {
  rule: 'frontmatter-schema',
  severity: 'warning' as const,
  filePath: '/tmp/test/project-documents/user/slices/100-slice.auth.md',
  description: "Invalid value 'in-progress' for field 'status' (will fix to 'in_progress')",
  fixAction: { type: 'update-frontmatter', field: 'status', value: 'in_progress' },
};

const unfixableFinding = {
  rule: 'frontmatter-schema',
  severity: 'warning' as const,
  filePath: '/tmp/test/project-documents/user/slices/200-slice.other.md',
  description: "Missing required field 'project'",
};

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerValidateCommand(program);
  return program;
}

describe('cf validate frontmatter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    mockGetById.mockResolvedValue(sampleProject);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    process.exitCode = undefined;
  });

  it('a clean run exits 0', async () => {
    mockValidateFrontmatterFiles.mockResolvedValue(cleanResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--project', 'proj_001']);

    expect(process.exitCode).toBeUndefined();
    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('No inconsistencies found');
  });

  it('findings present without --fix exits 1', async () => {
    mockValidateFrontmatterFiles.mockResolvedValue({ findings: [statusFinding], filesChecked: 1 });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--project', 'proj_001']);

    expect(process.exitCode).toBe(1);
    expect(mockUpdateFrontmatterField).not.toHaveBeenCalled();
  });

  it('an unresolvable project exits 2', async () => {
    mockGetAll.mockResolvedValue([]);
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--project', 'nope']);

    expect(exitSpy).toHaveBeenCalledWith(2);
  });

  it('--fix that resolves everything exits 0', async () => {
    mockValidateFrontmatterFiles.mockResolvedValue({ findings: [statusFinding], filesChecked: 1 });
    mockUpdateFrontmatterField.mockResolvedValue({
      rule: '',
      action: 'update-frontmatter',
      filePath: statusFinding.filePath,
      field: 'status',
      before: 'in-progress',
      after: 'in_progress',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--project', 'proj_001', '--fix']);

    expect(process.exitCode).toBeUndefined();
    expect(mockUpdateFrontmatterField).toHaveBeenCalledWith(
      statusFinding.filePath,
      'status',
      'in_progress',
      expect.any(String),
    );
    // The composed guarantee (#71 + #73): --fix must stamp dateUpdated with
    // the run's date via the fourth argument to updateFrontmatterField.
    const dateStampArg = mockUpdateFrontmatterField.mock.calls[0][3];
    expect(dateStampArg).toMatch(/^\d{8}$/);
  });

  it('--fix with a fix failure exits 1 and reports the failure', async () => {
    mockValidateFrontmatterFiles.mockResolvedValue({ findings: [statusFinding], filesChecked: 1 });
    mockUpdateFrontmatterField.mockRejectedValue(new Error('Permission denied'));

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--project', 'proj_001', '--fix']);

    expect(process.exitCode).toBe(1);
    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Permission denied');
  });

  it('a finding without a fixAction remains unfixed after --fix and exits 1', async () => {
    mockValidateFrontmatterFiles.mockResolvedValue({ findings: [unfixableFinding], filesChecked: 1 });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--project', 'proj_001', '--fix']);

    expect(process.exitCode).toBe(1);
    expect(mockUpdateFrontmatterField).not.toHaveBeenCalled();
  });

  it('--json emits the documented shape with filesChecked and findings', async () => {
    mockValidateFrontmatterFiles.mockResolvedValue({ findings: [statusFinding], filesChecked: 5 });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--project', 'proj_001', '--json']);

    const raw = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.filesChecked).toBe(5);
    expect(parsed.totalFindings).toBe(1);
    expect(parsed.warnings).toBe(1);
    expect(parsed.errors).toBe(0);
    expect(parsed.findings).toHaveLength(1);
    expect(parsed.findings[0].filePath).toBe(statusFinding.filePath);
  });

  it('--json in fix mode includes fixed, fixLog, and fixErrors', async () => {
    mockValidateFrontmatterFiles.mockResolvedValue({ findings: [statusFinding], filesChecked: 1 });
    mockUpdateFrontmatterField.mockResolvedValue({
      rule: '',
      action: 'update-frontmatter',
      filePath: statusFinding.filePath,
      field: 'status',
      before: 'in-progress',
      after: 'in_progress',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--project', 'proj_001', '--fix', '--json']);

    const raw = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.fixed).toBe(1);
    expect(parsed.fixLog).toHaveLength(1);
    expect(parsed.fixErrors).toEqual([]);
  });

  it('forwards explicit paths to the service unchanged', async () => {
    mockValidateFrontmatterFiles.mockResolvedValue(cleanResult);

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'validate', 'frontmatter', 'a.md', 'b.md', '--project', 'proj_001',
    ]);

    expect(mockValidateFrontmatterFiles).toHaveBeenCalledWith(
      sampleProject.projectPath,
      ['a.md', 'b.md'],
      { projectName: sampleProject.name },
    );
  });

  it('passes undefined paths to the service when none are given', async () => {
    mockValidateFrontmatterFiles.mockResolvedValue(cleanResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--project', 'proj_001']);

    expect(mockValidateFrontmatterFiles).toHaveBeenCalledWith(
      sampleProject.projectPath,
      undefined,
      { projectName: sampleProject.name },
    );
  });
});
