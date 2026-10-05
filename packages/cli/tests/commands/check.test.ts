import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { registerCheckCommand } from '../../src/commands/check.js';
import { ConsistencyChecker, ConfigManager } from '@context-forge/core/node';

const mockQuestion = vi.fn();
const mockClose = vi.fn();
const mockOn = vi.fn();
vi.mock('node:readline', () => ({
  createInterface: vi.fn(() => ({
    question: mockQuestion,
    close: mockClose,
    on: mockOn,
  })),
}));

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockCheck = vi.fn();
const mockFix = vi.fn();
const mockCheckAll = vi.fn();
const mockFixAll = vi.fn();
const mockApplyFixes = vi.fn();
const mockConfigGet = vi.fn();
const mockDetectDocuments = vi.fn();
const mockUpdateFrontmatterField = vi.fn();

vi.mock('@context-forge/core/node', async () => {
  const actual = await vi.importActual<typeof import('@context-forge/core/node')>('@context-forge/core/node');
  return {
    // Real routing (slice 213): for a single checkout it only orchestrates the mocked checker.
    planRoutedFixes: actual.planRoutedFixes,
    applyFixPlan: actual.applyFixPlan,
    resolveInvokingCheckout: actual.resolveInvokingCheckout,
    scopeCheck: actual.scopeCheck,
    resolveFixInvokingPath: actual.resolveFixInvokingPath,
    planFixRun: actual.planFixRun,
    FileProjectStore: vi.fn().mockImplementation(() => ({
      getAll: mockGetAll,
      getById: mockGetById,
    })),
    ArtifactIntrospector: vi.fn(),
    ConsistencyChecker: vi.fn().mockImplementation(() => ({
      check: mockCheck,
      fix: mockFix,
      checkAll: mockCheckAll,
      fixAll: mockFixAll,
      applyFixes: mockApplyFixes,
    })),
    ConfigManager: vi.fn().mockImplementation(() => ({
      get: mockConfigGet,
    })),
    detectDocuments: (...args: unknown[]) => mockDetectDocuments(...args),
    updateFrontmatterField: (...args: unknown[]) => mockUpdateFrontmatterField(...args),
  };
});

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
      description: '[100] Tasks complete but slice unchecked in plan',
      suggestedFix: 'Check the slice plan entry',
      fixable: true,
    },
    {
      rule: 'missing-artifact',
      severity: 'info',
      location: '/tmp/test/tasks.md',
      description: '[100] No matching slice plan entry',
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

  it('constructs ConsistencyChecker with a ConfigManager for the project path', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockCheckAll.mockResolvedValue(noFindingsResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_001']);

    expect(ConfigManager).toHaveBeenCalledWith(sampleProject.projectPath);
    const configInstance = vi.mocked(ConfigManager).mock.results[0]?.value;
    expect(ConsistencyChecker).toHaveBeenCalledWith(expect.anything(), configInstance);
  });

  it('defaults to all-slices mode (calls checkAll)', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockCheckAll.mockResolvedValue(noFindingsResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_001']);

    expect(mockCheckAll).toHaveBeenCalled();
    expect(mockCheck).not.toHaveBeenCalled();
  });

  it('shows clean message when no findings', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockCheckAll.mockResolvedValue(noFindingsResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('No inconsistencies found');
  });

  it('shows findings grouped by slice index', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockCheckAll.mockResolvedValue(findingsResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('⚠');
    expect(output).toContain('ℹ');
    expect(output).toContain('Tasks complete but slice unchecked');
    expect(output).toContain('Slice 100');
    expect(output).toContain('2 findings');
  });

  it('narrows to single slice with --slice flag', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockCheck.mockResolvedValue(noFindingsResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_001', '--slice', '175']);

    expect(mockCheck).toHaveBeenCalled();
    expect(mockCheckAll).not.toHaveBeenCalled();
  });

  it('uses applyFixes with --fix --yes in all-slices mode', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockCheckAll.mockResolvedValue(findingsResult);
    mockApplyFixes.mockResolvedValue(fixResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_001', '--fix', '--yes']);

    expect(mockApplyFixes).toHaveBeenCalled();
    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('fix mode');
    expect(output).toContain('Fixed 1 of 2');
  });

  it('reports file-update count separately when a cross-checkout fix collapses to fewer findings', async () => {
    // #100: two checkouts sharing one logical finding dedup to a single
    // displayed finding, but each checkout's file still gets its own write,
    // so `fixed` (2) can exceed `totalFindings` (1). "Fixed 2 of 1 findings"
    // would be nonsense; the message must describe both numbers plainly.
    mockGetById.mockResolvedValue(sampleProject);
    mockCheckAll.mockResolvedValue({ ...findingsResult, findings: [findingsResult.findings[0]], totalFindings: 1 });
    mockApplyFixes.mockResolvedValue({
      ...findingsResult,
      findings: [findingsResult.findings[0]],
      totalFindings: 1,
      fixed: 2,
      fixLog: [
        { rule: 'task-vs-plan', action: 'update-checkbox', filePath: '/tmp/wt-a/plan.md', before: '[ ]', after: '[x]' },
        { rule: 'task-vs-plan', action: 'update-checkbox', filePath: '/tmp/wt-b/plan.md', before: '[ ]', after: '[x]' },
      ],
      fixErrors: [],
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_001', '--fix', '--yes']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).not.toContain('Fixed 2 of 1');
    expect(output).toContain('Fixed 1 finding(s) (2 file update(s) across checkouts)');
  });

  it('pairs each fixed finding with its own fixLog entry when several share a rule', async () => {
    // Two frontmatter-schema fixes in one run (as strict status validation
    // produces): each rendered "Fixed:" line must name its own file, not the
    // first entry matching the rule. Findings carry relative locations; the
    // fix log records absolute paths.
    const twoFixResult = {
      projectPath: '/tmp/test',
      findings: [
        {
          rule: 'frontmatter-schema',
          severity: 'warning',
          location: 'user/slices/101-slice.a.md',
          description: "Invalid value 'not-started' for field 'status'",
          suggestedFix: 'Update status',
          fixable: true,
        },
        {
          rule: 'frontmatter-schema',
          severity: 'warning',
          location: 'user/slices/105-slice.b.md',
          description: "Invalid value 'not started' for field 'status'",
          suggestedFix: 'Update status',
          fixable: true,
        },
      ],
      totalFindings: 2,
      errors: 0,
      warnings: 2,
      infos: 0,
      summary: '2 findings: 2 warnings',
      fixed: 2,
      fixLog: [
        { rule: 'frontmatter-schema', action: 'update-frontmatter', filePath: '/tmp/test/user/slices/101-slice.a.md', before: 'not-started', after: 'not_started' },
        { rule: 'frontmatter-schema', action: 'update-frontmatter', filePath: '/tmp/test/user/slices/105-slice.b.md', before: 'not started', after: 'not_started' },
      ],
      fixErrors: [],
    };
    mockGetById.mockResolvedValue(sampleProject);
    mockCheckAll.mockResolvedValue(twoFixResult);
    mockApplyFixes.mockResolvedValue(twoFixResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_001', '--fix', '--yes']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Fixed: not-started → not_started in /tmp/test/user/slices/101-slice.a.md');
    expect(output).toContain('Fixed: not started → not_started in /tmp/test/user/slices/105-slice.b.md');
  });

  it('outputs valid JSON with --json flag', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockCheckAll.mockResolvedValue(findingsResult);

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
    mockCheckAll.mockResolvedValue(noFindingsResult);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_001']);

    expect(mockGetById).toHaveBeenCalledWith('proj_001');
  });

  it('prompts for confirmation on --fix without --yes, aborts on decline', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockCheckAll.mockResolvedValue(findingsResult);

    // Simulate user declining
    mockQuestion.mockImplementation((_prompt: string, cb: (answer: string) => void) => cb('n'));

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check', '--project', 'proj_001', '--fix']);

    // Should have called checkAll for dry run but NOT fixAll
    expect(mockCheckAll).toHaveBeenCalled();
    expect(mockFixAll).not.toHaveBeenCalled();

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Aborted');
  });
});

describe('cf check --set-review-none', () => {
  const SLICE_DESIGN = 'project-documents/user/slices/100-slice.auth.md';
  const originalIsTTY = process.stdin.isTTY;

  function setTTY(value: boolean | undefined): void {
    Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
  }

  function answerPrompt(answer: string): void {
    mockQuestion.mockImplementation((_prompt: string, cb: (answer: string) => void) => cb(answer));
  }

  function run(...extra: string[]): Promise<Command> {
    return createProgram().parseAsync([
      'node', 'cf', 'check', '--project', 'proj_001', '--set-review-none', '100', ...extra,
    ]);
  }

  const output = () => vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    mockGetById.mockResolvedValue(sampleProject);
    mockDetectDocuments.mockResolvedValue({
      sliceDesign: SLICE_DESIGN,
      taskFile: null,
      architecture: null,
      slicePlan: null,
      review: null,
    });
    mockUpdateFrontmatterField.mockResolvedValue({
      rule: '',
      action: 'update-frontmatter',
      filePath: `/tmp/test/${SLICE_DESIGN}`,
      field: 'review',
      before: '',
      after: 'none',
    });
    setTTY(false);
    mockOn.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    setTTY(originalIsTTY);
  });

  it('with --yes writes review: none, printing the slice path and waiver text', async () => {
    await run('--yes');

    expect(mockDetectDocuments).toHaveBeenCalledWith('/tmp/test', 100);
    expect(mockUpdateFrontmatterField).toHaveBeenCalledWith(
      expect.stringContaining('100-slice.auth.md'),
      'review',
      'none',
      expect.any(String),
    );
    expect(mockQuestion).not.toHaveBeenCalled();
    // Must never touch the checker/fix pipeline — this is a direct mutation.
    expect(mockCheck).not.toHaveBeenCalled();
    expect(mockCheckAll).not.toHaveBeenCalled();

    expect(output()).toContain(SLICE_DESIGN);
    expect(output()).toContain('waives the slice, tasks, and code review gates');
    expect(output()).toContain('Project Manager decision');
    expect(output()).toContain('Set review: none on slice 100');
  });

  it('non-TTY without --yes → errors naming --yes, writes nothing', async () => {
    await run();

    expect(mockUpdateFrontmatterField).not.toHaveBeenCalled();
    expect(mockQuestion).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('--yes is required'));
  });

  it('--json without --yes → errors, writes nothing', async () => {
    setTTY(true);
    await run('--json');

    expect(mockUpdateFrontmatterField).not.toHaveBeenCalled();
    expect(mockQuestion).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('--yes is required with --json'));
  });

  it('TTY, user declines → prints Cancelled., writes nothing', async () => {
    setTTY(true);
    answerPrompt('n');
    await run();

    expect(mockQuestion).toHaveBeenCalledWith('Proceed? [y/N] ', expect.any(Function));
    expect(mockUpdateFrontmatterField).not.toHaveBeenCalled();
    expect(output()).toContain('Cancelled.');
  });

  it('TTY, stdin closes without an answer (EOF) → treated as no, writes nothing', async () => {
    setTTY(true);
    mockQuestion.mockImplementation(() => {});
    mockOn.mockImplementation((event: string, handler: () => void) => {
      if (event === 'close') handler();
    });
    await run();

    expect(mockUpdateFrontmatterField).not.toHaveBeenCalled();
    expect(output()).toContain('Cancelled.');
  });

  it('TTY, user confirms → writes review: none', async () => {
    setTTY(true);
    answerPrompt('y');
    await run();

    expect(output()).toContain('waives the slice, tasks, and code review gates');
    expect(mockUpdateFrontmatterField).toHaveBeenCalledWith(
      expect.stringContaining('100-slice.auth.md'), 'review', 'none', expect.any(String),
    );
  });

  it('errors when no slice-design file exists for the index', async () => {
    mockDetectDocuments.mockResolvedValue({
      sliceDesign: null,
      taskFile: null,
      architecture: null,
      slicePlan: null,
      review: null,
    });

    await run('--yes');

    expect(mockUpdateFrontmatterField).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('No slice-design file found'));
  });

  it('errors on a non-numeric index', async () => {
    await createProgram().parseAsync(['node', 'cf', 'check', '--project', 'proj_001', '--set-review-none', 'abc']);

    expect(mockDetectDocuments).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Invalid slice index'));
  });

  it('outputs JSON with --json --yes and no prose', async () => {
    await run('--json', '--yes');

    const raw = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.slice).toBe(100);
    expect(parsed.field).toBe('review');
    expect(parsed.after).toBe('none');
    expect(console.log).not.toHaveBeenCalled();
  });
});
