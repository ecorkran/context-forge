import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContextPipeline } from '../../src/services/CoreServiceFactory.js';
import { ContextIntegrator } from '../../src/services/ContextIntegrator.js';
import type { CodebaseReferenceResolver } from '../../src/services/ContextIntegrator.js';
import { resolveCodebaseReferenceForPrompt } from '../../src/services/codebaseReferenceResolver.js';
import {
  CODEBASE_REFERENCE_HEADING,
  CODEBASE_REFERENCE_LABELS,
  COMPREHENSION_NONE,
  DOCS_MAP_CURRENT,
  DOCS_MAP_NONE,
} from '../../src/adoption/index.js';
import { writeDocsMap } from '../../src/docs-map/index.js';
import { PROMPT_FILE_RELATIVE_PATH } from '../../src/services/constants.js';
import { createTestProjectData } from '../helpers/testData.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures');
const PROJECT_NAME = 'acme';
const COMPREHENSION_DOC = 'project-documents/user/analysis/700-analysis.comprehension.md';
const MAP_FILE = `project-documents/user/architecture/050-docs-map.${PROJECT_NAME}.md`;
const PHASES_WITH_SECTION = ['Phase 2: Architecture', 'Phase 3: Slice Planning', 'Phase 4: Slice Design'];
const PHASES_WITHOUT_SECTION = ['Phase 5: Task Breakdown', 'Phase 6: Implementation', 'an-unlisted-instruction'];

let root: string;

function useFixture(name: string): void {
  cpSync(join(FIXTURES, name), root, { recursive: true });
}

function writeFile(relativePath: string, content: string): void {
  mkdirSync(dirname(join(root, relativePath)), { recursive: true });
  writeFileSync(join(root, relativePath), content);
}

/** Builds with the real pipeline engine and the given resolver (null: the pre-274 wiring). */
async function build(
  instruction: string,
  resolver: CodebaseReferenceResolver | null,
  fileComprehension = '',
): Promise<string> {
  const { engine } = createContextPipeline(root);
  const integrator = new ContextIntegrator(
    engine,
    true,
    (file) => readFileSync(file, 'utf-8'),
    null,
    null,
    null,
    resolver,
  );
  const project = createTestProjectData({
    name: PROJECT_NAME,
    projectPath: root,
    instruction,
    fileComprehension,
  });
  return integrator.generateContextFromProject(project);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cf-codebase-gate-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('Codebase Reference section: profile gate (D6)', () => {
  beforeEach(() => useFixture('codebase-reference-guide'));

  it.each(PHASES_WITH_SECTION)('%s shows both documents after Project Context', async (instruction) => {
    writeFile(COMPREHENSION_DOC, '# analysis\n');
    await writeDocsMap(root, PROJECT_NAME);
    const output = await build(instruction, resolveCodebaseReferenceForPrompt, COMPREHENSION_DOC);
    expect(output).toContain(CODEBASE_REFERENCE_HEADING);
    expect(output).toContain(`${CODEBASE_REFERENCE_LABELS.comprehension}: ${COMPREHENSION_DOC}`);
    expect(output).toContain(`${CODEBASE_REFERENCE_LABELS.docsMap}: ${MAP_FILE} (${DOCS_MAP_CURRENT})`);
    expect(output.indexOf(CODEBASE_REFERENCE_HEADING)).toBeGreaterThan(output.indexOf('### Project Context'));
    expect(output.indexOf(CODEBASE_REFERENCE_HEADING)).toBeLessThan(output.indexOf('### Instruction Prompt'));
  });

  it.each(PHASES_WITH_SECTION)('%s with neither document shows the two none lines', async (instruction) => {
    const output = await build(instruction, resolveCodebaseReferenceForPrompt);
    expect(output).toContain(`${CODEBASE_REFERENCE_LABELS.comprehension}: ${COMPREHENSION_NONE}`);
    expect(output).toContain(`${CODEBASE_REFERENCE_LABELS.docsMap}: ${DOCS_MAP_NONE}`);
  });

  it.each(PHASES_WITHOUT_SECTION)('%s has no section and never calls the resolver', async (instruction) => {
    const resolver = vi.fn<CodebaseReferenceResolver>();
    const output = await build(instruction, resolver);
    expect(output).not.toContain(CODEBASE_REFERENCE_HEADING);
    expect(resolver).not.toHaveBeenCalled();
  });

  it('passes the listed variables, the checkout and the project name to the resolver', async () => {
    const resolver = vi.fn<CodebaseReferenceResolver>().mockResolvedValue('');
    await build('Phase 4: Slice Design', resolver, COMPREHENSION_DOC);
    expect(resolver).toHaveBeenCalledWith(root, PROJECT_NAME, COMPREHENSION_DOC, {
      comprehension: true,
      docsMap: true,
    });
  });

  it('an empty section text leaves the output byte-identical to the pre-274 build', async () => {
    const withEmpty = await build('Phase 4: Slice Design', vi.fn<CodebaseReferenceResolver>().mockResolvedValue(''));
    expect(withEmpty).toBe(await build('Phase 4: Slice Design', null));
  });
});

describe('Codebase Reference section: no profiles available', () => {
  it('does not call the resolver when the guide has no profiles block', async () => {
    writeFile(PROMPT_FILE_RELATIVE_PATH, '---\ndocType: system-prompt\n---\n\n# System Prompt\n');
    const resolver = vi.fn<CodebaseReferenceResolver>();
    const output = await build('Phase 4: Slice Design', resolver);
    expect(output).not.toContain(CODEBASE_REFERENCE_HEADING);
    expect(resolver).not.toHaveBeenCalled();
  });
});

describe('Codebase Reference section under today\'s guide (brownfield-guide fixture)', () => {
  beforeEach(() => useFixture('brownfield-guide'));

  it.each(PHASES_WITH_SECTION)('%s is byte-identical to the build without the resolver', async (instruction) => {
    const withResolver = await build(instruction, resolveCodebaseReferenceForPrompt);
    expect(withResolver).toBe(await build(instruction, null));
    expect(withResolver).not.toContain(CODEBASE_REFERENCE_HEADING);
  });

  it('brownfield-adoption gains exactly the one comprehension line, and no docs map line', async () => {
    const output = await build('brownfield-adoption', resolveCodebaseReferenceForPrompt);
    const before = await build('brownfield-adoption', null);
    const section = `${CODEBASE_REFERENCE_HEADING}\n${CODEBASE_REFERENCE_LABELS.comprehension}: ${COMPREHENSION_NONE}`;
    expect(output).toContain(section);
    expect(output).not.toContain(CODEBASE_REFERENCE_LABELS.docsMap);
    expect(output.replace(`${section}\n\n`, '')).toBe(before);
  });
});
