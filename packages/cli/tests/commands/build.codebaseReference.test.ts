import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Command } from 'commander';
import {
  COMPREHENSION_REFRESH_SENTENCE,
  DOCS_MAP_CURRENT,
  DOCS_MAP_OUT_OF_DATE,
  writeDocsMap,
} from '@context-forge/core/node';
import { registerBuildCommand } from '../../src/commands/build.js';

/**
 * `cf build` over a real guide fixture, real files and the real pipeline (slice 274, D5). Only
 * the project store and the guide checkout are stubbed.
 */

const mockGetAll = vi.fn();
const mockGetById = vi.fn();

vi.mock('@context-forge/core/node', async () => {
  const actual = await vi.importActual<typeof import('@context-forge/core/node')>('@context-forge/core/node');
  return {
    ...actual,
    FileProjectStore: class {
      getAll = mockGetAll;
      getById = mockGetById;
    },
    GuideManager: class {
      ensureCheckout = vi.fn().mockResolvedValue({ action: 'none' });
    },
    checkGuideMinimum: vi.fn().mockResolvedValue(null),
  };
});

const FIXTURE = join(import.meta.dirname, '../../../core/tests/fixtures/codebase-reference-guide');
const PROJECT_NAME = 'acme';
const COMPREHENSION_DOC = 'project-documents/user/analysis/700-analysis.comprehension.md';
const SLICE_DESIGN_PHASE = '4';

let root: string;

function writeFile(relativePath: string, content: string): void {
  mkdirSync(dirname(join(root, relativePath)), { recursive: true });
  writeFileSync(join(root, relativePath), content);
}

/** Runs `cf build --json` at Phase 4 and returns the built context text. */
async function build(): Promise<string> {
  vi.mocked(process.stdout.write).mockClear();
  const program = new Command();
  program.exitOverride();
  registerBuildCommand(program);
  await program.parseAsync(['node', 'cf', 'build', '--project', 'proj_001', '--phase', SLICE_DESIGN_PHASE, '--json']);
  const written = vi.mocked(process.stdout.write).mock.calls.map((call) => String(call[0])).join('');
  return (JSON.parse(written) as { context: string }).context;
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cf-build-codebase-ref-'));
  cpSync(FIXTURE, root, { recursive: true });
  writeFile(COMPREHENSION_DOC, '# analysis\n');
  const project = {
    id: 'proj_001',
    name: PROJECT_NAME,
    template: 'default',
    fileComprehension: COMPREHENSION_DOC,
    projectPath: root,
    dateProject: '2026-01-15',
  };
  mockGetAll.mockResolvedValue([project]);
  mockGetById.mockResolvedValue(project);
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe('cf build: Codebase Reference drift and degradation (D5)', () => {
  it('a new doc turns the docs map out of date; rewriting the map makes it current again', async () => {
    await writeDocsMap(root, PROJECT_NAME);
    expect(await build()).toContain(`(${DOCS_MAP_CURRENT})`);

    writeFile('docs/b.md', '# b\n');
    expect(await build()).toContain(`(${DOCS_MAP_OUT_OF_DATE})`);

    await writeDocsMap(root, PROJECT_NAME);
    expect(await build()).toContain(`(${DOCS_MAP_CURRENT})`);
  });

  it('a deleted comprehension file shows the missing line with the refresh sentence, and the build succeeds', async () => {
    rmSync(join(root, COMPREHENSION_DOC));
    const context = await build();
    expect(context).toContain(`${COMPREHENSION_DOC} (missing: ENOENT). ${COMPREHENSION_REFRESH_SENTENCE}`);
    expect(process.exit).not.toHaveBeenCalled();
  });
});
