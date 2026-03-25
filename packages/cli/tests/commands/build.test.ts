import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerBuildCommand } from '../../src/commands/build.js';

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockGenerateContextFromProject = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
  })),
  createContextPipeline: vi.fn().mockImplementation(() => ({
    integrator: { generateContextFromProject: mockGenerateContextFromProject },
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ value: '' }),
  })),
}));

import { createContextPipeline } from '@context-forge/core/node';

const sampleProject = {
  id: 'proj_001',
  name: 'test-project',
  fileSlice: '100-slice.auth',
  fileTasks: '100-tasks.auth',
  instruction: 'implementation',
  developmentPhase: 'Phase 6: Implementation',
  projectPath: '/tmp/test',
};

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerBuildCommand(program);
  return program;
}

describe('cf build', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('bare CLI shows help message to stderr, nothing to stdout', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGenerateContextFromProject.mockResolvedValue('Generated context output');

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'build', '--project', 'proj_001']);

    const stdoutCalls = vi.mocked(process.stdout.write).mock.calls;
    const stdoutOutput = stdoutCalls.map((c) => c[0]).join('');
    expect(stdoutOutput).toBe('');

    const stderrCalls = vi.mocked(process.stderr.write).mock.calls;
    const stderrOutput = stderrCalls.map((c) => c[0]).join('');
    expect(stderrOutput).toContain('Context built for');
    expect(stderrOutput).toContain('/cf:build');
    expect(stderrOutput).toContain('cf build --json');
  });

  it('--json writes context as JSON to stdout', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGenerateContextFromProject.mockResolvedValue('Generated context output');

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'build', '--project', 'proj_001', '--json']);

    const stdoutCalls = vi.mocked(process.stdout.write).mock.calls;
    const output = stdoutCalls.map((c) => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.project).toBe('test-project');
    expect(parsed.phase).toBe('Phase 6: Implementation');
    expect(parsed.context).toBe('Generated context output');
  });

  it('writes status message to stderr', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGenerateContextFromProject.mockResolvedValue('context');

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'build', '--project', 'proj_001']);

    const stderrCalls = vi.mocked(process.stderr.write).mock.calls;
    const stderrOutput = stderrCalls.map((c) => c[0]).join('');
    expect(stderrOutput).toContain('Building context');
  });

  it('applies --phase override and resolves short name', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGenerateContextFromProject.mockResolvedValue('context');

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'build', '--project', 'proj_001', '--phase', 'task-breakdown']);

    const projectArg = mockGenerateContextFromProject.mock.calls[0]?.[0];
    expect(projectArg.developmentPhase).toBe('Phase 5: Task Breakdown');
    expect(projectArg.instruction).toBe('Phase 5: Task Breakdown');
  });

  it('resolves P-prefix shorthand in --phase', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGenerateContextFromProject.mockResolvedValue('context');

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'build', '--project', 'proj_001', '--phase', 'P5']);

    const projectArg = mockGenerateContextFromProject.mock.calls[0]?.[0];
    expect(projectArg.developmentPhase).toBe('Phase 5: Task Breakdown');
    expect(projectArg.instruction).toBe('Phase 5: Task Breakdown');
  });

  it('warns on unrecognized --phase value', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGenerateContextFromProject.mockResolvedValue('context');

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'build', '--project', 'proj_001', '--phase', 'bogus']);

    const stderrOutput = vi.mocked(process.stderr.write).mock.calls.map((c) => c[0]).join('');
    expect(stderrOutput).toContain('not a recognized phase');
    // Still uses raw value as fallback
    const projectArg = mockGenerateContextFromProject.mock.calls[0]?.[0];
    expect(projectArg.developmentPhase).toBe('bogus');
  });

  it('applies --slice override', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGenerateContextFromProject.mockResolvedValue('context');

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'build', '--project', 'proj_001', '--slice', '200-slice.new']);

    const projectArg = mockGenerateContextFromProject.mock.calls[0]?.[0];
    expect(projectArg.fileSlice).toBe('200-slice.new');
  });

  it('applies --instruction override', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGenerateContextFromProject.mockResolvedValue('context');

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'build', '--project', 'proj_001', '--instruction', 'review']);

    const projectArg = mockGenerateContextFromProject.mock.calls[0]?.[0];
    expect(projectArg.instruction).toBe('review');
  });

  it('applies --tasks override', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGenerateContextFromProject.mockResolvedValue('context');

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'build', '--project', 'proj_001', '--tasks', '200-tasks.new']);

    const projectArg = mockGenerateContextFromProject.mock.calls[0]?.[0];
    expect(projectArg.fileTasks).toBe('200-tasks.new');
  });

  it('appends additional instructions', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGenerateContextFromProject.mockResolvedValue('base context');

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'build', '--project', 'proj_001', '--json',
      '--additional', 'Extra instructions here',
    ]);

    const output = vi.mocked(process.stdout.write).mock.calls.map((c) => c[0]).join('');
    const parsed = JSON.parse(output);
    expect(parsed.context).toContain('base context');
    expect(parsed.context).toContain('Extra instructions here');
  });

  it('calls createContextPipeline with project path', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGenerateContextFromProject.mockResolvedValue('context');

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'build', '--project', 'proj_001']);

    expect(createContextPipeline).toHaveBeenCalledWith('/tmp/test');
  });

  it('applies --instruction-type override to instruction field', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGenerateContextFromProject.mockResolvedValue('context');

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'build', '--project', 'proj_001', '--instruction-type', 'maintenance',
    ]);

    const projectArg = mockGenerateContextFromProject.mock.calls[0]?.[0];
    expect(projectArg.instruction).toBe('maintenance');
  });

  it('--it shorthand sets instruction same as --instruction-type', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGenerateContextFromProject.mockResolvedValue('context');

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'build', '--project', 'proj_001', '--it', 'implementation',
    ]);

    const projectArg = mockGenerateContextFromProject.mock.calls[0]?.[0];
    expect(projectArg.instruction).toBe('implementation');
  });

  it('--instruction-type uses working copy only; stored project instruction is unchanged', async () => {
    mockGetById.mockResolvedValue({ ...sampleProject, instruction: 'implementation' });
    mockGenerateContextFromProject.mockResolvedValue('context');

    const program = createProgram();
    await program.parseAsync([
      'node', 'cf', 'build', '--project', 'proj_001', '--instruction-type', 'maintenance',
    ]);

    // generateContextFromProject receives overridden instruction
    const projectArg = mockGenerateContextFromProject.mock.calls[0]?.[0];
    expect(projectArg.instruction).toBe('maintenance');
    // But store.getById was only called once (no update call pattern)
    expect(mockGetById).toHaveBeenCalledTimes(1);
  });
});
