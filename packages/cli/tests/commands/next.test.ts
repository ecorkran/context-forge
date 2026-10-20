import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerNextCommand } from '../../src/commands/next.js';

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockGetNext = vi.fn();
const mockNavigatorCtor = vi.fn();
const mockConfigManagerCtor = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  upstreamLag: vi.fn().mockResolvedValue(null),
  formatUpstreamLagWarning: vi.fn(),
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
  })),
  WorkflowNavigator: vi.fn().mockImplementation((...args: unknown[]) => {
    mockNavigatorCtor(...args);
    return { getNext: mockGetNext };
  }),
  ConfigManager: vi.fn().mockImplementation((...args: unknown[]) => {
    mockConfigManagerCtor(...args);
    return { get: vi.fn().mockResolvedValue({ value: '' }) };
  }),
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
    mockGetAll.mockResolvedValue([sampleProject]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('shows "Continue implementation" when tasks remain', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGetNext.mockResolvedValue({
      recommendation: 'Continue implementation — 6 tasks remaining',
      rationale: 'Slice 100 is in progress with 6 tasks left.',
      phase: 'Phase 6: Implementation',
      slice: '100-slice.auth',
      summary: 'Continue slice 100 — 6 tasks remaining',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'next', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Continue implementation');
    expect(output).toContain('6 tasks remaining');
  });

  it('shows suggested command when available', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGetNext.mockResolvedValue({
      recommendation: 'Advance to slice 101: Users',
      rationale: 'Current slice is complete.',
      suggestedCommand: 'cf set slice 101',
      slice: '100-slice.auth',
      summary: 'Advance to slice 101',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'next', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Advance');
    expect(output).toContain('cf set slice 101');
  });

  it('outputs valid JSON with --json flag', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGetNext.mockResolvedValue({
      recommendation: 'Continue implementation — 2 tasks remaining',
      rationale: 'In progress.',
      phase: 'Phase 6: Implementation',
      slice: '100-slice.auth',
      summary: 'Continue',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'next', '--project', 'proj_001', '--json']);

    const raw = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed.recommendation).toBeDefined();
    expect(parsed.slice).toBe('100-slice.auth');
  });

  describe('offers', () => {
    const baseAction = {
      recommendation: 'Continue implementation — 2 tasks remaining',
      rationale: 'In progress.',
      suggestedCommand: 'cf build',
      summary: 'Continue',
    };
    const offer = { id: 'setup-ci', message: 'No CI detected for this project.' };

    it('prints one Offer line after Run', async () => {
      mockGetById.mockResolvedValue(sampleProject);
      mockGetNext.mockResolvedValue({ ...baseAction, offers: [offer] });

      await createProgram().parseAsync(['node', 'cf', 'next', '--project', 'proj_001']);

      const lines = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
      const offerLines = lines.filter((l) => l.includes('Offer:'));
      expect(offerLines).toHaveLength(1);
      expect(offerLines[0]).toContain(offer.message);
      expect(lines.findIndex((l) => l.includes('Offer:'))).toBeGreaterThan(lines.findIndex((l) => l.includes('Run:')));
    });

    it('prints no Offer line without offers', async () => {
      mockGetById.mockResolvedValue(sampleProject);
      mockGetNext.mockResolvedValue(baseAction);

      await createProgram().parseAsync(['node', 'cf', 'next', '--project', 'proj_001']);

      const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
      expect(output).not.toContain('Offer:');
    });

    it('includes offers in --json output', async () => {
      mockGetById.mockResolvedValue(sampleProject);
      mockGetNext.mockResolvedValue({ ...baseAction, offers: [offer] });

      await createProgram().parseAsync(['node', 'cf', 'next', '--project', 'proj_001', '--json']);

      const parsed = JSON.parse(vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string);
      expect(parsed.offers).toEqual([offer]);
    });
  });

  describe('pending decisions', () => {
    const pendingAction = {
      recommendation: 'Blocked: design has pending PM decisions',
      rationale: 'Slice 100 design has 2 decisions pending PM confirmation.',
      slice: '100-slice.auth',
      summary: 'Blocked — slice 100 has 2 pending PM decisions',
      pendingDecisions: [
        { heading: 'D1 — First', line: 12 },
        { heading: 'D2 — Second', line: 40 },
      ],
    };

    it('lists each decision under the rationale', async () => {
      mockGetById.mockResolvedValue(sampleProject);
      mockGetNext.mockResolvedValue(pendingAction);

      await createProgram().parseAsync(['node', 'cf', 'next', '--project', 'proj_001']);

      const lines = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
      expect(lines.some((l) => l.includes('  - D1 — First (line 12)'))).toBe(true);
      expect(lines.some((l) => l.includes('  - D2 — Second (line 40)'))).toBe(true);
    });

    it('--json includes pendingDecisions', async () => {
      mockGetById.mockResolvedValue(sampleProject);
      mockGetNext.mockResolvedValue(pendingAction);

      await createProgram().parseAsync(['node', 'cf', 'next', '--project', 'proj_001', '--json']);

      const parsed = JSON.parse(vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string);
      expect(parsed.pendingDecisions).toEqual(pendingAction.pendingDecisions);
    });

    it('prints no decision lines when nothing is pending', async () => {
      mockGetById.mockResolvedValue(sampleProject);
      mockGetNext.mockResolvedValue({
        recommendation: 'Continue implementation — 2 tasks remaining',
        rationale: 'In progress.',
        summary: 'Continue',
      });

      await createProgram().parseAsync(['node', 'cf', 'next', '--project', 'proj_001']);

      const lines = vi.mocked(console.log).mock.calls.map((c) => String(c[0]));
      expect(lines.some((l) => l.includes('(line '))).toBe(false);
    });
  });

  it('constructs ConfigManager at project path and passes it to WorkflowNavigator, surfacing a blocked recommendation end-to-end', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGetNext.mockResolvedValue({
      recommendation: 'Blocked: review verdict does not clear threshold',
      rationale: "Review artifact present but verdict FAIL does not clear threshold 'concerns' for slice 100.",
      slice: '100-slice.auth',
      summary: 'Blocked — slice 100 review does not clear',
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'next', '--project', 'proj_001']);

    expect(mockConfigManagerCtor).toHaveBeenCalledWith(sampleProject.projectPath);
    expect(mockNavigatorCtor).toHaveBeenCalledWith(expect.objectContaining({ get: expect.any(Function) }));

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Blocked');
    expect(output).toContain('does not clear threshold');
  });
});
