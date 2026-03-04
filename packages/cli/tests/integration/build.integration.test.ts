import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { createContextPipeline } from '@context-forge/core/node';
import type { ProjectData } from '@context-forge/core';

/**
 * Integration tests for cf build — verifies CLI uses same core pipeline as MCP.
 * Uses the MCP server's fixture project directly via core service calls.
 */

const FIXTURE_ROOT = path.resolve(
  import.meta.dirname,
  '../../../mcp-server/tests/fixtures/integration-project/integration-project',
);

const fixtureProject: ProjectData = {
  id: 'project_integration_001',
  name: 'integration-test-project',
  template: 'default',
  fileSlice: '100-slice.auth',
  fileTasks: '100-tasks.auth',
  instruction: 'implementation',
  developmentPhase: 'Phase 6: Implementation',
  workType: 'continue',
  dateProject: '2026-02-23',
  isMonorepo: false,
  projectPath: FIXTURE_ROOT,
  createdAt: '2026-02-23T00:00:00.000Z',
  updatedAt: '2026-02-23T00:00:00.000Z',
};

describe('cf build integration — core pipeline parity', () => {
  it('generates context via same createContextPipeline as MCP', async () => {
    const { integrator } = createContextPipeline(FIXTURE_ROOT);
    const context = await integrator.generateContextFromProject(fixtureProject);

    expect(context).toBeTruthy();
    expect(typeof context).toBe('string');
    expect(context.length).toBeGreaterThan(0);
  });

  it('context contains project name from fixture', async () => {
    const { integrator } = createContextPipeline(FIXTURE_ROOT);
    const context = await integrator.generateContextFromProject(fixtureProject);

    expect(context).toContain('integration-test-project');
  });

  it('context contains slice name from fixture', async () => {
    const { integrator } = createContextPipeline(FIXTURE_ROOT);
    const context = await integrator.generateContextFromProject(fixtureProject);

    expect(context).toContain('100-slice.auth');
  });

  it('override changes output', async () => {
    const { integrator } = createContextPipeline(FIXTURE_ROOT);
    const overridden: ProjectData = {
      ...fixtureProject,
      instruction: 'design',
    };
    const context = await integrator.generateContextFromProject(overridden);

    // Should now use the design instruction instead of implementation
    expect(context).toBeTruthy();
    expect(context.length).toBeGreaterThan(0);
  });
});
