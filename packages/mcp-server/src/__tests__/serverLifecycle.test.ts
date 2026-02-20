import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DIST_INDEX = join(import.meta.dirname, '..', '..', 'dist', 'index.js');
const INIT_REQUEST = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' },
  },
});
const INITIALIZED_NOTIFICATION = JSON.stringify({
  jsonrpc: '2.0',
  method: 'notifications/initialized',
});
const TOOLS_LIST_REQUEST = JSON.stringify({
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/list',
  params: {},
});

/** Read one JSON-RPC response line from a child process stdout */
function readResponse(child: ChildProcess): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout waiting for response')), 10_000);
    let buffer = '';

    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed) as Record<string, unknown>;
          clearTimeout(timeout);
          child.stdout?.off('data', onData);
          resolve(parsed);
          return;
        } catch {
          // Not yet a complete JSON line, keep buffering
        }
      }
    };

    child.stdout?.on('data', onData);
    child.stdout?.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/** Send a JSON-RPC message to child stdin */
function sendMessage(child: ChildProcess, message: string): void {
  child.stdin?.write(message + '\n');
}

describe('Server Lifecycle', () => {
  let tempDir: string;
  let child: ChildProcess | undefined;

  afterEach(async () => {
    if (child && child.exitCode === null) {
      child.stdin?.end();
      // Give process time to exit
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          child?.kill();
          resolve();
        }, 3000);
        child?.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('starts, completes MCP handshake, lists all 3 tools, and exits cleanly', async () => {
    // Setup isolated temp data dir
    tempDir = await mkdtemp(join(tmpdir(), 'cf-mcp-test-'));
    await writeFile(join(tempDir, 'projects.json'), '[]');

    // Spawn server
    child = spawn('node', [DIST_INDEX], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, CONTEXT_FORGE_DATA_DIR: tempDir },
    });

    // Step 1: Send initialize request
    sendMessage(child, INIT_REQUEST);
    const initResponse = await readResponse(child);

    expect(initResponse.jsonrpc).toBe('2.0');
    expect(initResponse.id).toBe(1);

    const result = initResponse.result as Record<string, unknown>;
    const serverInfo = result.serverInfo as Record<string, unknown>;
    expect(serverInfo.name).toBe('context-forge-mcp');

    // Step 2: Send initialized notification
    sendMessage(child, INITIALIZED_NOTIFICATION);

    // Step 3: Request tools/list
    sendMessage(child, TOOLS_LIST_REQUEST);
    const toolsResponse = await readResponse(child);

    expect(toolsResponse.id).toBe(2);
    const toolsResult = toolsResponse.result as Record<string, unknown>;
    const tools = toolsResult.tools as { name: string }[];
    const toolNames = tools.map((t) => t.name).sort();
    expect(toolNames).toEqual(['project_get', 'project_list', 'project_update']);

    // Step 4: Close stdin and verify clean exit
    child.stdin?.end();
    const exitCode = await new Promise<number | null>((resolve) => {
      child?.on('exit', (code) => resolve(code));
      setTimeout(() => resolve(null), 5000);
    });
    expect(exitCode).toBe(0);
  });
});
