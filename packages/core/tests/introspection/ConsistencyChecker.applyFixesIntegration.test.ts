import { join } from 'node:path';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConsistencyChecker } from '../../src/introspection/ConsistencyChecker.js';
import type { IArtifactIntrospector } from '../../src/introspection/interfaces.js';
import type { ProjectData } from '../../src/types/project.js';
import type { FrontmatterResult } from '../../src/introspection/types.js';

/**
 * Slice 923 design section B1's central guard, proven end-to-end against the
 * real (unmocked) writer rather than at the unit level: a document missing
 * `dateUpdated` but carrying `dateCreated` must, after applyFixes(), end up
 * with `dateUpdated` equal to its `dateCreated` value — not the run's date
 * stamp. This is what protects the backfill fixAction from the stamp
 * clobbering it.
 */

let tmpDir: string;
let projectPath: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'cc-applyfixes-'));
  projectPath = tmpDir;
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function makeProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    id: 'test-1',
    name: 'test-project',
    template: 'default',
    fileSlice: '900-slice.scratch',
    fileTasks: undefined,
    fileSlicePlan: undefined,
    instruction: 'implementation',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    projectPath,
    ...overrides,
  };
}

/** Minimal introspector: only parseFrontmatter reads the real file; everything else no-ops. */
function makeIntrospector(): IArtifactIntrospector {
  return {
    parseSlicePlan: async () => ({ filePath: '', entries: [], totalSlices: 0, completedSlices: 0 }),
    parseTaskFile: async () => ({ filePath: '', items: [], totalTasks: 0, completedTasks: 0 }),
    parseFrontmatter: async (filePath: string): Promise<FrontmatterResult> => {
      const content = await readFile(filePath, 'utf-8');
      const match = content.match(/^---\n([\s\S]*?)\n---/);
      if (!match) return { filePath, found: false, data: {} };
      const data: Record<string, string> = {};
      for (const line of match[1].split('\n')) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        data[line.slice(0, colonIdx).trim()] = line.slice(colonIdx + 1).trim();
      }
      return { filePath, found: true, data };
    },
  } as unknown as IArtifactIntrospector;
}

describe('ConsistencyChecker.applyFixes — dateUpdated stamp integration', () => {
  it('backfills dateUpdated from dateCreated, not the run date stamp', async () => {
    const slicesDir = join(projectPath, 'project-documents', 'user', 'slices');
    await mkdir(slicesDir, { recursive: true });
    const filePath = join(slicesDir, '900-slice.scratch.md');
    await writeFile(
      filePath,
      '---\ndocType: slice-design\nslice: scratch\nproject: test-project\nstatus: complete\ndateCreated: 20250601\n---\n\n# Scratch\n',
      'utf-8'
    );

    const checker = new ConsistencyChecker(makeIntrospector());
    const project = makeProject();
    const checkResult = await checker.checkAll(project);

    const finding = checkResult.findings.find(
      (f) => f.rule === 'frontmatter-schema' && f.fixAction?.detail && (f.fixAction.detail as { key?: string }).key === 'dateUpdated'
    );
    expect(finding).toBeDefined();

    // Run date stamp deliberately differs from dateCreated, so the assertion
    // below is only true if the guard fires — not by coincidence.
    await checker.applyFixes(checkResult, '20260809');

    const result = await readFile(filePath, 'utf-8');
    expect(result).toContain('dateUpdated: 20250601');
    expect(result).not.toContain('dateUpdated: 20260809');
  });
});
