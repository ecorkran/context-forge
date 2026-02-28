import { vi } from 'vitest';
import type { ContextData, EnhancedContextData, ProjectData, SystemPrompt } from '../../src/types/index.js';
import type { IStatementReader, IPromptReader } from '../../src/services/interfaces.js';

/**
 * Creates a valid ContextData object with sensible defaults.
 * All required fields are populated; pass overrides to customize.
 */
export function createTestContextData(overrides?: Partial<ContextData>): ContextData {
  return {
    projectName: 'test-project',
    template: 'default',
    fileSlice: '100-slice.test-feature',
    fileTasks: '100-tasks.test-feature',
    instruction: 'implementation',
    developmentPhase: 'Phase 7: Implementation',
    workType: 'start',
    dateProject: '2026-01-15',
    isMonorepo: false,
    recentEvents: '',
    additionalNotes: '',
    ...overrides,
  };
}

/**
 * Creates a valid EnhancedContextData object with sensible defaults.
 * Extends ContextData with optional enhanced fields.
 */
export function createTestEnhancedContextData(
  overrides?: Partial<EnhancedContextData>,
): EnhancedContextData {
  return {
    ...createTestContextData(),
    availableTools: [],
    mcpServers: [],
    templateVersion: '1.0',
    customSections: {},
    customData: {
      recentEvents: '',
      additionalNotes: '',
      monorepoNote: '',
      availableTools: '',
    },
    ...overrides,
  };
}

/**
 * Creates a valid ProjectData object with sensible defaults.
 * Includes auto-generated fields (id, timestamps).
 */
export function createTestProjectData(overrides?: Partial<ProjectData>): ProjectData {
  return {
    id: 'project_test_001',
    name: 'test-project',
    template: 'default',
    fileSlice: '100-slice.test-feature',
    fileTasks: '100-tasks.test-feature',
    instruction: 'implementation',
    developmentPhase: 'Phase 7: Implementation',
    workType: 'start',
    dateProject: '2026-01-15',
    isMonorepo: false,
    isMonorepoEnabled: false,
    projectPath: '/tmp/test-project',
    fileHLD: undefined,
    fileArch: undefined,
    fileSlicePlan: undefined,
    fileSpec: undefined,
    customData: {
      recentEvents: '',
      additionalNotes: '',
      monorepoNote: '',
      availableTools: '',
    },
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * Creates a mock IStatementReader with vi.fn() stubs.
 * By default, getStatement returns a placeholder string for any key.
 */
export function createMockStatementReader(
  overrides?: Partial<Record<keyof IStatementReader, ReturnType<typeof vi.fn>>>,
): IStatementReader {
  return {
    getStatement: vi.fn((key: string) => `[statement: ${key}]`),
    ...overrides,
  };
}

/**
 * Creates a mock SystemPrompt for use in prompt reader mocks.
 */
function createDefaultPrompt(name: string, key: string, content: string): SystemPrompt {
  return { name, key, content, parameters: [] };
}

/**
 * Creates a mock IPromptReader with vi.fn() stubs.
 * By default, methods return valid SystemPrompt objects.
 */
export function createMockPromptReader(
  overrides?: Partial<Record<keyof IPromptReader, ReturnType<typeof vi.fn>>>,
): IPromptReader {
  return {
    getToolUsePrompt: vi.fn(async () =>
      createDefaultPrompt('Tool Use', 'tool-use', 'Use the following tools as appropriate.'),
    ),
    getPromptForInstruction: vi.fn(async (instruction: string) =>
      createDefaultPrompt(instruction, instruction.toLowerCase(), `Instructions for ${instruction}.`),
    ),
    getContextInitializationPrompt: vi.fn(async (isMonorepo?: boolean) =>
      createDefaultPrompt(
        'Context Initialization',
        'context-initialization',
        isMonorepo
          ? 'You are working on {{projectName}} (monorepo).'
          : 'You are working on {{projectName}}.',
      ),
    ),
    ...overrides,
  };
}
