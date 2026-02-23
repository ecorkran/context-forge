import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { mkdtemp, readFile, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerProjectTools } from '../../src/tools/projectTools.js';
import { registerContextTools } from '../../src/tools/contextTools.js';
import { registerStateTools } from '../../src/tools/stateTools.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Absolute path to the committed fixture directory (contains projects.json) */
const FIXTURE_DIR = join(__dirname, '../fixtures/integration-project');

/** Absolute path to the integration project directory (the "projectPath" value) */
const FIXTURE_PROJECT_PATH = join(FIXTURE_DIR, 'integration-project');

/** Placeholder value in committed projects.json */
const PROJECT_PATH_PLACEHOLDER = '__FIXTURE_PROJECT_PATH__';

// ---------------------------------------------------------------------------
// createIntegrationClient
// ---------------------------------------------------------------------------

export interface IntegrationClient {
  client: Client;
  cleanup: () => Promise<void>;
}

/**
 * Creates an MCP server with all 3 tool groups registered and connects an
 * in-process client via InMemoryTransport — mirrors the real server setup.
 */
export async function createIntegrationClient(): Promise<IntegrationClient> {
  const server = new McpServer({ name: 'integration-test', version: '0.1.0' });
  registerProjectTools(server);
  registerContextTools(server);
  registerStateTools(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);

  return {
    client,
    cleanup: async () => {
      await client.close();
      await server.close();
    },
  };
}

// ---------------------------------------------------------------------------
// setupFixtureEnv
// ---------------------------------------------------------------------------

export interface FixtureEnv {
  /** Absolute path to the temp directory where patched projects.json lives */
  tempDir: string;
  /** Restores process.env and removes the temp directory */
  cleanup: () => Promise<void>;
}

/**
 * Reads the committed projects.json, patches the projectPath placeholder to
 * the absolute fixture project path, writes the result to a temp directory,
 * and sets CONTEXT_FORGE_DATA_DIR to point at the temp directory.
 */
export async function setupFixtureEnv(): Promise<FixtureEnv> {
  const tempDir = await mkdtemp(join(tmpdir(), 'cf-integration-'));

  await patchAndWriteProjectsJson(tempDir);

  const previousDataDir = process.env.CONTEXT_FORGE_DATA_DIR;
  process.env.CONTEXT_FORGE_DATA_DIR = tempDir;

  return {
    tempDir,
    cleanup: async () => {
      if (previousDataDir === undefined) {
        delete process.env.CONTEXT_FORGE_DATA_DIR;
      } else {
        process.env.CONTEXT_FORGE_DATA_DIR = previousDataDir;
      }
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}

// ---------------------------------------------------------------------------
// resetFixtureData
// ---------------------------------------------------------------------------

/**
 * Re-patches and re-writes projects.json to the temp directory.
 * Call in afterEach after mutation tests (project_update, context_summarize)
 * to restore the original fixture state.
 */
export async function resetFixtureData(tempDir: string): Promise<void> {
  await patchAndWriteProjectsJson(tempDir);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function patchAndWriteProjectsJson(destDir: string): Promise<void> {
  const raw = await readFile(join(FIXTURE_DIR, 'projects.json'), 'utf-8');
  const patched = raw.replace(PROJECT_PATH_PLACEHOLDER, FIXTURE_PROJECT_PATH);
  await writeFile(join(destDir, 'projects.json'), patched, 'utf-8');
}
