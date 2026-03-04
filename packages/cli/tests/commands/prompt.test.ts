import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerPromptCommand } from '../../src/commands/prompt.js';

const mockGetAll = vi.fn();
const mockGetById = vi.fn();
const mockGetAllPrompts = vi.fn();
const mockGetPromptForInstruction = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  FileProjectStore: vi.fn().mockImplementation(() => ({
    getAll: mockGetAll,
    getById: mockGetById,
  })),
  SystemPromptParser: vi.fn().mockImplementation(() => ({
    getAllPrompts: mockGetAllPrompts,
    getPromptForInstruction: mockGetPromptForInstruction,
  })),
  ConfigManager: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue({ value: '' }),
  })),
}));

// Mock phase shorthand parser
vi.mock('../../src/utils/phaseShorthand.js', () => ({
  getPhaseShorthands: vi.fn().mockResolvedValue(
    new Map([
      ['P1', 'Concept'],
      ['P5', 'Task Breakdown'],
      ['P6', 'Implementation'],
    ]),
  ),
  resolvePhaseInput: vi.fn().mockImplementation(async (input: string) => {
    const map: Record<string, string> = { P5: 'Task Breakdown', P6: 'Implementation', p5: 'Task Breakdown' };
    return map[input] ?? input.replace(/-/g, ' ');
  }),
  clearPhaseShorthandCache: vi.fn(),
}));

const sampleProject = {
  id: 'proj_001',
  name: 'my-project',
  fileSlice: '168-slice.cli-foundation',
  fileTasks: '168-tasks.cli-foundation',
  instruction: 'implementation',
  developmentPhase: 'Phase 6: Implementation',
  projectPath: '/tmp/test',
  fileArch: '160-arch.project-workflow-system.md',
  fileHLD: '050-arch.hld-context-forge.md',
};

const samplePrompts = [
  { name: 'Concept (Phase 1)', key: 'concept-phase-1', content: 'Concept template', parameters: [] },
  { name: 'Task Breakdown (Phase 5)', key: 'task-breakdown-phase-5', content: 'Work on {project}, slice {slice}, tasks {task-file}', parameters: ['project', 'slice'] },
  { name: 'Implementation (Phase 6)', key: 'implementation-phase-6', content: 'Implement {slice} in {project}', parameters: ['project', 'slice'] },
];

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerPromptCommand(program);
  return program;
}

describe('cf prompt list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('renders table with Name/Key/Shorthand', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGetAllPrompts.mockResolvedValue(samplePrompts);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'prompt', 'list', '--project', 'proj_001']);

    const output = vi.mocked(console.log).mock.calls[0]?.[0] as string;
    expect(output).toContain('Concept');
    expect(output).toContain('concept-phase-1');
  });

  it('outputs JSON with --json flag', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGetAllPrompts.mockResolvedValue(samplePrompts);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'prompt', 'list', '--project', 'proj_001', '--json']);

    const raw = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(raw);
    expect(parsed).toHaveLength(3);
    expect(parsed[0].name).toContain('Concept');
  });
});

describe('cf prompt get', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAll.mockResolvedValue([sampleProject]);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('resolves P5 shorthand and outputs with variable substitution', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGetPromptForInstruction.mockResolvedValue(samplePrompts[1]);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'prompt', 'get', 'P5', '--project', 'proj_001']);

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    // Variables should be substituted
    expect(output).toContain('my-project');
    expect(output).toContain('168-slice.cli-foundation');
    expect(output).toContain('168-tasks.cli-foundation');
  });

  it('preserves unresolvable variables', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGetPromptForInstruction.mockResolvedValue({
      name: 'Test',
      key: 'test',
      content: 'Known: {project}, Unknown: {some-unknown-var}',
      parameters: [],
    });

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'prompt', 'get', 'test', '--project', 'proj_001']);

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    expect(output).toContain('my-project');
    expect(output).toContain('{some-unknown-var}');
  });

  it('skips substitution with --raw flag', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGetPromptForInstruction.mockResolvedValue(samplePrompts[2]);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'prompt', 'get', 'P6', '--project', 'proj_001', '--raw']);

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    // Should contain raw {slice} not the resolved value
    expect(output).toContain('{slice}');
    expect(output).toContain('{project}');
    expect(output).not.toContain('my-project');
  });

  it('handles case-insensitive phase input', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGetPromptForInstruction.mockResolvedValue(samplePrompts[1]);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'prompt', 'get', 'task-breakdown', '--project', 'proj_001']);

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    expect(output).toContain('my-project');
  });

  it('errors for unknown phase', async () => {
    mockGetById.mockResolvedValue(sampleProject);
    mockGetPromptForInstruction.mockResolvedValue(null);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'prompt', 'get', 'nonexistent', '--project', 'proj_001']);

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('No prompt found'),
    );
  });
});
