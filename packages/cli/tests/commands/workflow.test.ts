import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerWorkflowCommands } from '../../src/commands/workflow.js';

// ──────────────────────────────────────────────────
// Mocks
// ──────────────────────────────────────────────────

const mockProjectSetAction = vi.fn();
const mockBuildAndPrint = vi.fn();
const mockDetectDocuments = vi.fn();
const mockCheckFileExists = vi.fn();
const mockGetAll = vi.fn();
const mockGetById = vi.fn();

vi.mock('../../src/commands/project.js', () => ({
  projectSetAction: (...args: unknown[]) => mockProjectSetAction(...args),
}));

vi.mock('../../src/commands/build.js', () => ({
  buildAndPrint: (...args: unknown[]) => mockBuildAndPrint(...args),
}));

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
  })),
  detectDocuments: (...args: unknown[]) => mockDetectDocuments(...args),
  checkFileExists: (...args: unknown[]) => mockCheckFileExists(...args),
}));

vi.mock('../../src/utils/project.js', () => ({
  resolveProjectWorktree: vi.fn().mockResolvedValue({ id: 'proj_001', worktreeId: undefined }),
}));

vi.mock('@context-forge/core', async () => {
  const actual = await vi.importActual('@context-forge/core');
  return {
    ...actual,
    resolveProject: vi.fn().mockResolvedValue({
      id: 'proj_001',
      name: 'test-project',
      projectPath: '/tmp/test',
      fileConcept: 'project-documents/user/project-guides/000-concept.test.md',
    }),
  };
});

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerWorkflowCommands(program);
  return program;
}

// ──────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────

describe('compound workflow commands', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([{ id: 'proj_001', projectPath: '/tmp/test' }]);
    mockGetById.mockResolvedValue({ id: 'proj_001', name: 'test-project', projectPath: '/tmp/test' });
    mockDetectDocuments.mockResolvedValue({ sliceDesign: null, taskFile: null, architecture: null, slicePlan: null });
    mockCheckFileExists.mockResolvedValue(false);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    stderrSpy.mockRestore();
  });

  // ── Command sequence tests ──

  it('cf concept: sets Phase 0 and calls buildAndPrint', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'concept']);

    expect(mockProjectSetAction).toHaveBeenCalledWith('developmentPhase', 'Phase 0: Concept', expect.any(Object));
    expect(mockBuildAndPrint).toHaveBeenCalledWith(expect.any(Object));
    expect(mockProjectSetAction).toHaveBeenCalledTimes(1);
  });

  it('cf initiatives: sets Phase 1 and calls buildAndPrint', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'initiatives']);

    expect(mockProjectSetAction).toHaveBeenCalledWith('developmentPhase', 'Phase 1: Initiative Plan', expect.any(Object));
    expect(mockBuildAndPrint).toHaveBeenCalled();
  });

  it('cf arch 220: sets fileArch with 220, sets phase to Phase 2, calls buildAndPrint', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'arch', '220']);

    expect(mockProjectSetAction).toHaveBeenCalledWith('fileArch', '220', expect.any(Object));
    expect(mockProjectSetAction).toHaveBeenCalledWith('developmentPhase', 'Phase 2: Architecture', expect.any(Object));
    expect(mockBuildAndPrint).toHaveBeenCalled();
    // fileArch is called first (triggers auto-set of fileSlicePlan in core)
    expect(mockProjectSetAction.mock.calls[0][0]).toBe('fileArch');
  });

  it('cf plan 220: sets fileSlicePlan and Phase 3', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'plan', '220']);

    expect(mockProjectSetAction).toHaveBeenCalledWith('fileSlicePlan', '220', expect.any(Object));
    expect(mockProjectSetAction).toHaveBeenCalledWith('developmentPhase', 'Phase 3: Slice Planning', expect.any(Object));
    expect(mockBuildAndPrint).toHaveBeenCalled();
  });

  it('cf slice 208: sets fileSlice with 208 and Phase 4', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'slice', '208']);

    expect(mockProjectSetAction).toHaveBeenCalledWith('fileSlice', '208', expect.any(Object));
    expect(mockProjectSetAction).toHaveBeenCalledWith('developmentPhase', 'Phase 4: Slice Design', expect.any(Object));
    expect(mockBuildAndPrint).toHaveBeenCalled();
    // fileSlice called first (triggers auto-set of fileTasks in core)
    expect(mockProjectSetAction.mock.calls[0][0]).toBe('fileSlice');
  });

  it('cf tasks 208: sets fileTasks with 208 and Phase 5', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'tasks', '208']);

    expect(mockProjectSetAction).toHaveBeenCalledWith('fileTasks', '208', expect.any(Object));
    expect(mockProjectSetAction).toHaveBeenCalledWith('developmentPhase', 'Phase 5: Task Breakdown', expect.any(Object));
    expect(mockBuildAndPrint).toHaveBeenCalled();
  });

  it('cf implement 208: sets fileSlice with 208 and Phase 6', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'implement', '208']);

    expect(mockProjectSetAction).toHaveBeenCalledWith('fileSlice', '208', expect.any(Object));
    expect(mockProjectSetAction).toHaveBeenCalledWith('developmentPhase', 'Phase 6: Implementation', expect.any(Object));
    expect(mockBuildAndPrint).toHaveBeenCalled();
  });

  // ── Warning behavior tests ──

  it('warns when artifact already exists', async () => {
    mockDetectDocuments.mockResolvedValue({
      sliceDesign: 'project-documents/user/slices/208-slice.test.md',
      taskFile: null,
      architecture: null,
      slicePlan: null,
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'slice', '208']);

    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderrOutput).toContain('already exists');
  });

  it('cf implement does not warn even when slice design exists', async () => {
    mockDetectDocuments.mockResolvedValue({
      sliceDesign: 'project-documents/user/slices/208-slice.test.md',
      taskFile: null,
      architecture: null,
      slicePlan: null,
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'implement', '208']);

    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderrOutput).not.toContain('already exists');
  });

  it('cf concept warns when concept doc exists', async () => {
    mockCheckFileExists.mockResolvedValue(true);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'concept']);

    const stderrOutput = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(stderrOutput).toContain('Concept document already exists');
  });

  // ── Auto-set verification ──

  it('cf arch 220: calls projectSetAction with fileArch (triggers auto-set of fileSlicePlan)', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'arch', '220']);

    // First call must be fileArch — this is what triggers auto-set in core
    const firstCall = mockProjectSetAction.mock.calls[0];
    expect(firstCall[0]).toBe('fileArch');
    expect(firstCall[1]).toBe('220');
  });

  it('cf slice 208: calls projectSetAction with fileSlice (triggers auto-set of fileTasks)', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'slice', '208']);

    const firstCall = mockProjectSetAction.mock.calls[0];
    expect(firstCall[0]).toBe('fileSlice');
    expect(firstCall[1]).toBe('208');
  });

  // ── Stdout/stderr routing ──

  it('buildAndPrint output goes to stdout (captured by mock)', async () => {
    // buildAndPrint is mocked — in real code it calls printRaw which writes to stdout
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'concept']);

    expect(mockBuildAndPrint).toHaveBeenCalled();
  });

  it('set confirmations go through projectSetAction (writes to console.log/stderr)', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'arch', '220']);

    // projectSetAction handles its own console output — verify it was called
    expect(mockProjectSetAction).toHaveBeenCalledTimes(2);
  });

  // ── Worktree correctness ──

  it('--project-level option is passed through to projectSetAction', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'arch', '220', '--project-level']);

    expect(mockProjectSetAction).toHaveBeenCalledWith(
      'fileArch',
      '220',
      expect.objectContaining({ projectLevel: true }),
    );
  });

  it('default behavior passes worktree-aware opts (no --project-level flag)', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'slice', '208']);

    // Without --project-level, the option should not be set to true
    const opts = mockProjectSetAction.mock.calls[0][2];
    expect(opts.projectLevel).toBeFalsy();
  });

  // ── Numeric index validation ──

  it('cf slice rejects non-numeric argument', async () => {
    const program = createProgram();
    const errorSpy = vi.spyOn(console, 'error');
    await program.parseAsync(['node', 'cf', 'slice', 'banana']);

    expect(mockProjectSetAction).not.toHaveBeenCalled();
    expect(mockBuildAndPrint).not.toHaveBeenCalled();
    const errorOutput = errorSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(errorOutput).toContain('requires a numeric index');
  });

  it('cf arch rejects non-numeric argument', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'arch', 'list']);

    expect(mockProjectSetAction).not.toHaveBeenCalled();
    expect(mockBuildAndPrint).not.toHaveBeenCalled();
  });

  it('cf implement rejects non-numeric argument', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'implement', 'foo']);

    expect(mockProjectSetAction).not.toHaveBeenCalled();
    expect(mockBuildAndPrint).not.toHaveBeenCalled();
  });

  it('cf tasks rejects non-numeric argument', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'tasks', 'items']);

    expect(mockProjectSetAction).not.toHaveBeenCalled();
    expect(mockBuildAndPrint).not.toHaveBeenCalled();
  });

  it('cf plan rejects non-numeric argument', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'plan', 'list']);

    expect(mockProjectSetAction).not.toHaveBeenCalled();
    expect(mockBuildAndPrint).not.toHaveBeenCalled();
  });
});
