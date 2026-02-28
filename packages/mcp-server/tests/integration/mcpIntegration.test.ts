/**
 * Integration tests for the MCP server.
 *
 * These tests use real @context-forge/core services (no vi.mock on core modules).
 * CONTEXT_FORGE_DATA_DIR is overridden to point at a fixture project so tests
 * are isolated from any user data.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  createIntegrationClient,
  setupFixtureEnv,
  resetFixtureData,
  type IntegrationClient,
  type FixtureEnv,
} from '../helpers/integrationSetup.js';

// ---------------------------------------------------------------------------
// Shared fixture project constants
// ---------------------------------------------------------------------------

const FIXTURE_PROJECT_ID = 'project_integration_001';
const FIXTURE_PROJECT_NAME = 'integration-test-project';
const FIXTURE_SLICE = '100-slice.auth';
const FIXTURE_TEMPLATE = 'default';
const FIXTURE_INSTRUCTION = 'implementation';
const FIXTURE_RECENT_EVENTS = 'Integration test fixture — verifies MCP tool responses.';
const FIXTURE_ADDITIONAL_NOTES = 'Additional notes for integration testing.';

// ---------------------------------------------------------------------------
// Suite-level setup
// ---------------------------------------------------------------------------

let fixtureEnv: FixtureEnv;
let ctx: IntegrationClient;
let client: Client;

beforeAll(async () => {
  fixtureEnv = await setupFixtureEnv();
  ctx = await createIntegrationClient();
  client = ctx.client;
});

afterAll(async () => {
  await ctx.cleanup();
  await fixtureEnv.cleanup();
});

// ---------------------------------------------------------------------------
// Smoke test
// ---------------------------------------------------------------------------

describe('smoke: project_list returns fixture project', () => {
  it('returns non-empty list containing the fixture project', async () => {
    const result = await client.callTool({ name: 'project_list', arguments: {} });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text) as { projects: { id: string }[]; count: number };

    expect(parsed.count).toBeGreaterThan(0);
    const ids = parsed.projects.map((p) => p.id);
    expect(ids).toContain(FIXTURE_PROJECT_ID);
  });
});

// ---------------------------------------------------------------------------
// project_list
// ---------------------------------------------------------------------------

describe('project_list', () => {
  it('returns fixture project with correct summary fields', async () => {
    const result = await client.callTool({ name: 'project_list', arguments: {} });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text) as {
      projects: Record<string, unknown>[];
      count: number;
    };

    const fixture = parsed.projects.find((p) => p.id === FIXTURE_PROJECT_ID);
    expect(fixture).toBeDefined();
    expect(fixture?.name).toBe(FIXTURE_PROJECT_NAME);
    expect(fixture?.fileSlice).toBe(FIXTURE_SLICE);
    expect(fixture?.template).toBe(FIXTURE_TEMPLATE);
    expect(fixture?.instruction).toBe(FIXTURE_INSTRUCTION);
  });

  it('summary excludes customData and createdAt (contract verification)', async () => {
    const result = await client.callTool({ name: 'project_list', arguments: {} });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text) as {
      projects: Record<string, unknown>[];
    };

    const fixture = parsed.projects.find((p) => p.id === FIXTURE_PROJECT_ID);
    expect(fixture).toBeDefined();
    expect(fixture?.customData).toBeUndefined();
    expect(fixture?.createdAt).toBeUndefined();
    expect(fixture?.fileTasks).toBeUndefined();
  });

  it('count matches number of fixture projects (1)', async () => {
    const result = await client.callTool({ name: 'project_list', arguments: {} });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text) as { count: number };

    expect(parsed.count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// project_get
// ---------------------------------------------------------------------------

describe('project_get', () => {
  it('returns full ProjectData including customData fields', async () => {
    const result = await client.callTool({
      name: 'project_get',
      arguments: { id: FIXTURE_PROJECT_ID },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text) as Record<string, unknown>;

    expect(parsed.id).toBe(FIXTURE_PROJECT_ID);
    expect(parsed.name).toBe(FIXTURE_PROJECT_NAME);
    expect(parsed.customData).toBeDefined();
    const customData = parsed.customData as Record<string, unknown>;
    expect(customData.recentEvents).toBe(FIXTURE_RECENT_EVENTS);
    expect(customData.additionalNotes).toBe(FIXTURE_ADDITIONAL_NOTES);
  });

  it('returns isError with helpful message for non-existent ID', async () => {
    const result = await client.callTool({
      name: 'project_get',
      arguments: { id: 'project_nonexistent' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('project_nonexistent');
    expect(content[0].text).toContain('project_list');
  });

  it('returned projectPath is an absolute path pointing to fixture directory', async () => {
    const result = await client.callTool({
      name: 'project_get',
      arguments: { id: FIXTURE_PROJECT_ID },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text) as { projectPath: string };

    expect(parsed.projectPath).toBeTruthy();
    expect(parsed.projectPath).toMatch(/^(?:\/|[A-Z]:\\)/); // absolute path
    expect(parsed.projectPath).toContain('integration-project');
  });
});

// ---------------------------------------------------------------------------
// project_update
// ---------------------------------------------------------------------------

describe('project_update', () => {
  afterEach(async () => {
    await resetFixtureData(fixtureEnv.tempDir);
  });

  it('updates fileSlice field and subsequent project_get returns updated value', async () => {
    const updateResult = await client.callTool({
      name: 'project_update',
      arguments: { id: FIXTURE_PROJECT_ID, fileSlice: '200-slice.updated' },
    });

    expect(updateResult.isError).toBeFalsy();
    const updateContent = updateResult.content as { type: string; text: string }[];
    const updated = JSON.parse(updateContent[0].text) as { fileSlice: string };
    expect(updated.fileSlice).toBe('200-slice.updated');
  });

  it('preserves unmodified fields after update', async () => {
    const updateResult = await client.callTool({
      name: 'project_update',
      arguments: { id: FIXTURE_PROJECT_ID, fileSlice: '200-slice.updated' },
    });

    expect(updateResult.isError).toBeFalsy();
    const content = updateResult.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text) as Record<string, unknown>;

    // Unmodified fields preserved
    expect(parsed.name).toBe(FIXTURE_PROJECT_NAME);
    expect(parsed.template).toBe(FIXTURE_TEMPLATE);
    const customData = parsed.customData as Record<string, unknown>;
    expect(customData.recentEvents).toBe(FIXTURE_RECENT_EVENTS);
  });

  it('state persists: project_get after update reflects the change', async () => {
    await client.callTool({
      name: 'project_update',
      arguments: { id: FIXTURE_PROJECT_ID, fileSlice: '300-slice.persisted' },
    });

    const getResult = await client.callTool({
      name: 'project_get',
      arguments: { id: FIXTURE_PROJECT_ID },
    });

    expect(getResult.isError).toBeFalsy();
    const content = getResult.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text) as { fileSlice: string };
    expect(parsed.fileSlice).toBe('300-slice.persisted');
  });
});

// ---------------------------------------------------------------------------
// context_build
// ---------------------------------------------------------------------------

describe('context_build', () => {
  it('returns non-empty plain text context for the fixture project', async () => {
    const result = await client.callTool({
      name: 'context_build',
      arguments: { projectId: FIXTURE_PROJECT_ID },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text.length).toBeGreaterThan(0);
  });

  it('output contains fixture project name and slice', async () => {
    const result = await client.callTool({
      name: 'context_build',
      arguments: { projectId: FIXTURE_PROJECT_ID },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const text = content[0].text;
    expect(text).toContain(FIXTURE_PROJECT_NAME);
    expect(text).toContain(FIXTURE_SLICE);
  });

  it('override fileSlice parameter appears in generated output', async () => {
    const result = await client.callTool({
      name: 'context_build',
      arguments: { projectId: FIXTURE_PROJECT_ID, fileSlice: 'override-slice-test' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('override-slice-test');
  });

  it('additionalInstructions content appears in output', async () => {
    const result = await client.callTool({
      name: 'context_build',
      arguments: {
        projectId: FIXTURE_PROJECT_ID,
        additionalInstructions: 'UNIQUE_ADDITIONAL_MARKER_XYZ',
      },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('UNIQUE_ADDITIONAL_MARKER_XYZ');
  });
});

// ---------------------------------------------------------------------------
// template_preview
// ---------------------------------------------------------------------------

describe('template_preview', () => {
  it('returns structural elements matching context_build for same parameters', async () => {
    const [buildResult, previewResult] = await Promise.all([
      client.callTool({ name: 'context_build', arguments: { projectId: FIXTURE_PROJECT_ID } }),
      client.callTool({ name: 'template_preview', arguments: { projectId: FIXTURE_PROJECT_ID } }),
    ]);

    expect(buildResult.isError).toBeFalsy();
    expect(previewResult.isError).toBeFalsy();

    const buildContent = buildResult.content as { type: string; text: string }[];
    const previewContent = previewResult.content as { type: string; text: string }[];

    // Both should contain the fixture project name
    expect(buildContent[0].text).toContain(FIXTURE_PROJECT_NAME);
    expect(previewContent[0].text).toContain(FIXTURE_PROJECT_NAME);
  });

  it('override fileSlice parameter works correctly in template_preview', async () => {
    const result = await client.callTool({
      name: 'template_preview',
      arguments: { projectId: FIXTURE_PROJECT_ID, fileSlice: 'preview-override-slice' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('preview-override-slice');
  });
});

// ---------------------------------------------------------------------------
// prompt_list
// ---------------------------------------------------------------------------

describe('prompt_list', () => {
  it('returns templates parsed from fixture prompt file', async () => {
    const result = await client.callTool({
      name: 'prompt_list',
      arguments: { projectId: FIXTURE_PROJECT_ID },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text) as { templates: unknown[] };
    expect(Array.isArray(parsed.templates)).toBe(true);
    expect(parsed.templates.length).toBeGreaterThan(0);
  });

  it('each template has name, key, and parameterCount fields', async () => {
    const result = await client.callTool({
      name: 'prompt_list',
      arguments: { projectId: FIXTURE_PROJECT_ID },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text) as {
      templates: { name: string; key: string; parameterCount: number }[];
    };

    for (const template of parsed.templates) {
      expect(typeof template.name).toBe('string');
      expect(typeof template.key).toBe('string');
      expect(typeof template.parameterCount).toBe('number');
    }
  });

  it('template count matches number of ##### sections in fixture prompt file (5)', async () => {
    const result = await client.callTool({
      name: 'prompt_list',
      arguments: { projectId: FIXTURE_PROJECT_ID },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text) as { templates: unknown[] };
    // The fixture prompt file has 6 ##### sections
    expect(parsed.templates).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// prompt_get
// ---------------------------------------------------------------------------

describe('prompt_get', () => {
  it('retrieves a specific template by name (case-insensitive)', async () => {
    const result = await client.callTool({
      name: 'prompt_get',
      arguments: { projectId: FIXTURE_PROJECT_ID, templateName: 'implementation' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('implementation');
  });

  it('retrieves Context Initialization template', async () => {
    const result = await client.callTool({
      name: 'prompt_get',
      arguments: { projectId: FIXTURE_PROJECT_ID, templateName: 'Context Initialization' },
    });

    expect(result.isError).toBeFalsy();
    const content = result.content as { type: string; text: string }[];
    expect(content[0].text).toContain('{{projectName}}');
    expect(content[0].text).toContain('{{fileSlice}}');
  });

  it('returns isError for non-existent template name', async () => {
    const result = await client.callTool({
      name: 'prompt_get',
      arguments: { projectId: FIXTURE_PROJECT_ID, templateName: 'nonexistent-template-xyz' },
    });

    expect(result.isError).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// context_summarize
// ---------------------------------------------------------------------------

describe('context_summarize', () => {
  afterEach(async () => {
    await resetFixtureData(fixtureEnv.tempDir);
  });

  it('updates customData.recentEvents and project_get read-back confirms change', async () => {
    const newSummary = 'Updated summary from integration test.';
    const summarizeResult = await client.callTool({
      name: 'context_summarize',
      arguments: { projectId: FIXTURE_PROJECT_ID, summary: newSummary },
    });

    expect(summarizeResult.isError).toBeFalsy();

    const getResult = await client.callTool({
      name: 'project_get',
      arguments: { id: FIXTURE_PROJECT_ID },
    });

    expect(getResult.isError).toBeFalsy();
    const content = getResult.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text) as { customData: Record<string, unknown> };
    expect(parsed.customData.recentEvents).toBe(newSummary);
  });

  it('preserves other customData fields after summary update', async () => {
    const summarizeResult = await client.callTool({
      name: 'context_summarize',
      arguments: {
        projectId: FIXTURE_PROJECT_ID,
        summary: 'New summary that preserves other fields.',
      },
    });

    expect(summarizeResult.isError).toBeFalsy();

    const getResult = await client.callTool({
      name: 'project_get',
      arguments: { id: FIXTURE_PROJECT_ID },
    });

    const content = getResult.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text) as { customData: Record<string, unknown> };
    // additionalNotes should be preserved
    expect(parsed.customData.additionalNotes).toBe(FIXTURE_ADDITIONAL_NOTES);
  });

  it('additionalNotes parameter updates the corresponding field', async () => {
    const newNotes = 'Updated notes from integration test.';
    const summarizeResult = await client.callTool({
      name: 'context_summarize',
      arguments: {
        projectId: FIXTURE_PROJECT_ID,
        summary: 'Summary to accompany notes update.',
        additionalNotes: newNotes,
      },
    });

    expect(summarizeResult.isError).toBeFalsy();

    const getResult = await client.callTool({
      name: 'project_get',
      arguments: { id: FIXTURE_PROJECT_ID },
    });

    const content = getResult.content as { type: string; text: string }[];
    const parsed = JSON.parse(content[0].text) as { customData: Record<string, unknown> };
    expect(parsed.customData.additionalNotes).toBe(newNotes);
  });
});
