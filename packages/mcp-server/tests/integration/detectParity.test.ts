import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ADOPTION_OPT_OUT, BROWNFIELD_MIN_SOURCE_LINES } from '@context-forge/core/node';
import { registerDetectTools } from '../../src/tools/detectTools.js';
import {
  ALL_RETROACTIVE_ENTRIES,
  createAdoptionFixture,
  type AdoptionFixtureOptions,
} from '../../../core/tests/helpers/adoptionFixtures.js';

/** `cf detect --json` and `project_detect` must print the same bytes (slice 271 D3/D5). */

const CLI_ENTRY = resolve(import.meta.dirname, '../../../cli/dist/index.js');

const OUTCOME_FIXTURES: readonly [string, AdoptionFixtureOptions][] = [
  ['opted-out', { state: ADOPTION_OPT_OUT }],
  ['adoption-incomplete', { concept: true, arch: true }],
  ['already-planned', { concept: true, arch: true, plan: ALL_RETROACTIVE_ENTRIES }],
  ['brownfield', { sourceLines: BROWNFIELD_MIN_SOURCE_LINES }],
  ['greenfield', {}],
];

describe('cf detect / project_detect parity', () => {
  let client: Client;
  let server: McpServer;
  let dataDir: string;
  const roots: string[] = [];

  beforeEach(async () => {
    if (!existsSync(CLI_ENTRY)) {
      throw new Error(`The built CLI is missing at ${CLI_ENTRY}. Run \`pnpm -r build\` first.`);
    }
    dataDir = mkdtempSync(join(tmpdir(), 'cf-detect-parity-'));
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
    rmSync(dataDir, { recursive: true, force: true });
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  });

  it.each(OUTCOME_FIXTURES)('%s: byte-identical output', async (outcome, options) => {
    const { root } = createAdoptionFixture(options);
    roots.push(root);

    const cli = spawnSync(process.execPath, [CLI_ENTRY, 'detect', '--path', root, '--json'], {
      env: { ...process.env, CONTEXT_FORGE_DATA_DIR: dataDir },
      encoding: 'utf-8',
    });
    expect(cli.status).toBe(0);

    const result = await client.callTool({ name: 'project_detect', arguments: { path: root } });
    const text = (result.content as { type: string; text: string }[])[0].text;

    expect(JSON.parse(text).outcome).toBe(outcome);
    // The CLI adds one trailing newline; nothing else may differ.
    expect(cli.stdout).toBe(text + '\n');
  });
});
