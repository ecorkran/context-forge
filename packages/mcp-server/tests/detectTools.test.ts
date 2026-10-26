import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { REPORT_VERSION } from '@context-forge/core/node';
import { registerDetectTools } from '../src/tools/detectTools.js';
import { createAdoptionFixture } from '../../core/tests/helpers/adoptionFixtures.js';

const TOOL_NAME = 'project_detect';
const RELATIVE_PATH = 'some/relative/dir';

interface ToolText {
  isError: boolean;
  text: string;
}

describe('project_detect', () => {
  let client: Client;
  let server: McpServer;
  const roots: string[] = [];

  beforeEach(async () => {
    server = new McpServer({ name: 'test-server', version: '0.1.0' });
    registerDetectTools(server);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: 'test-client', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  });

  async function detect(path: string): Promise<ToolText> {
    const result = await client.callTool({ name: TOOL_NAME, arguments: { path } });
    const content = result.content as { type: string; text: string }[];
    return { isError: result.isError === true, text: content[0].text };
  }

  function expectEnvelope(result: ToolText, code: string): void {
    expect(result.isError).toBe(true);
    const envelope = JSON.parse(result.text);
    expect(envelope).toMatchObject({ reportVersion: REPORT_VERSION, error: { code } });
    expect(envelope.error.message.length).toBeGreaterThan(0);
  }

  it('reports a greenfield directory', async () => {
    const { root } = createAdoptionFixture();
    roots.push(root);
    const result = await detect(root);
    expect(result.isError).toBe(false);
    expect(JSON.parse(result.text)).toMatchObject({
      reportVersion: REPORT_VERSION,
      projectRoot: root,
      outcome: 'greenfield',
    });
  });

  it('refuses a relative path as path-not-found, saying it must be absolute', async () => {
    const result = await detect(RELATIVE_PATH);
    expectEnvelope(result, 'path-not-found');
    expect(JSON.parse(result.text).error.message).toContain('absolute');
  });

  it('refuses a missing absolute path as path-not-found', async () => {
    const scratch = mkdtempSync(join(tmpdir(), 'cf-detect-mcp-'));
    roots.push(scratch);
    expectEnvelope(await detect(join(scratch, 'missing')), 'path-not-found');
  });

  it('is annotated read-only', async () => {
    const { tools } = await client.listTools();
    expect(tools.find((tool) => tool.name === TOOL_NAME)?.annotations?.readOnlyHint).toBe(true);
  });
});
