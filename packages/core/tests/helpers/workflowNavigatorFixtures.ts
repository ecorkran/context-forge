import { join } from 'node:path';
import type { ResolvedProject } from '../../src/types/project.js';
import { makeStubConfig } from './stubConfig.js';

export const PROJECT_ROOT = join(__dirname, '..', 'fixtures', 'introspection', 'project');

export function makeProject(overrides: Partial<ResolvedProject> = {}): ResolvedProject {
  return {
    id: 'test-1',
    name: 'test-project',
    template: 'default',
    fileSlice: '100-slice.test-feature.md',
    fileTasks: '100-tasks.test-feature.md',
    instruction: 'implementation',
    createdAt: '2026-01-01',
    updatedAt: '2026-02-28',
    projectPath: PROJECT_ROOT,
    ...overrides,
  };
}

export const GATE_ENABLED_DEFAULTS = {
  'workflow.review_enabled': true,
  'workflow.review_threshold': 'concerns',
  'workflow.review_unknown_as': 'fail',
  'workflow.review_weak_pass_as': 'pass',
  'workflow.review_gates.arch.threshold': '',
  'workflow.review_gates.slice.threshold': '',
  'workflow.review_gates.tasks.threshold': '',
  'workflow.review_gates.code.threshold': '',
  'workflow.review_gate_effective_date': '',
};

export const GATE_DISABLED_CONFIG = makeStubConfig({
  ...GATE_ENABLED_DEFAULTS,
  'workflow.review_enabled': false,
});
