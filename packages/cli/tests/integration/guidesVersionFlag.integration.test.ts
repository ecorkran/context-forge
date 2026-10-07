import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * The root program's --version must not swallow `cf guides install|update
 * --version <tag>`. The command tests build their own Command, so only the
 * real entry point can show this; it needs the built CLI (pnpm build).
 */
const CLI_ENTRY = join(dirname(fileURLToPath(import.meta.url)), '../../dist/index.js');

describe('cf guides --version <tag> reaches the subcommand', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'cf-version-flag-'));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  function run(...args: string[]): { stdout: string; stderr: string } {
    if (!existsSync(CLI_ENTRY)) {
      throw new Error(`${CLI_ENTRY} is missing; run pnpm build before this test`);
    }
    // A project that does not exist: the command fails after parsing, without touching any real project.
    const result = spawnSync('node', [CLI_ENTRY, ...args, '--project', 'no-such-project'], {
      encoding: 'utf-8',
      env: { ...process.env, CONTEXT_FORGE_DATA_DIR: dataDir },
    });
    return { stdout: result.stdout, stderr: result.stderr };
  }

  it.each(['install', 'update'])('guides %s runs instead of printing the cf version', (command) => {
    const { stdout, stderr } = run('guides', command, '--version', 'v9.9.9');

    expect(stdout).not.toMatch(/^\d+\.\d+\.\d+\s*$/);
    expect(stderr + stdout).toMatch(/no-such-project/);
  });

  it('the root --version still prints the cf version', () => {
    const result = spawnSync('node', [CLI_ENTRY, '--version'], { encoding: 'utf-8' });

    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
