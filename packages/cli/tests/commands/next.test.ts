import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerNextCommand } from '../../src/commands/next.js';

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockGetNext = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
  })),
  WorkflowNavigator: vi.fn().mockImplementation(() => ({
    getNext: mockGetNext,
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ value: '' }),
  })),
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
});
