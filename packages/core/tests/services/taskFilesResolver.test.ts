import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveTaskFilesForPrompt } from '../../src/services/taskFilesResolver.js';
import { TemplateProcessor } from '../../src/services/TemplateProcessor.js';
import type { ContextData } from '../../src/types/context.js';

const SLICE = '127-slice.pan-to-load-range-fetching';

describe('resolveTaskFilesForPrompt', () => {
  let root: string;
  let tasksDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cf-taskfiles-'));
    tasksDir = join(root, 'project-documents', 'user', 'tasks');
    mkdirSync(tasksDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('returns every part of a split tasks file in order (trading-ui slice 127 layout)', async () => {
    for (const n of [3, 1, 2]) {
      writeFileSync(join(tasksDir, `127-tasks.pan-to-load-range-fetching-${n}.md`), '');
    }
    const result = await resolveTaskFilesForPrompt(root, SLICE);
    expect(result).toBe(
      'user/tasks/127-tasks.pan-to-load-range-fetching-1.md, ' +
        'user/tasks/127-tasks.pan-to-load-range-fetching-2.md, ' +
        'user/tasks/127-tasks.pan-to-load-range-fetching-3.md',
    );
  });

  it('orders part 10 after part 9', async () => {
    for (const n of [1, 2, 9, 10]) {
      writeFileSync(join(tasksDir, `127-tasks.pan-to-load-range-fetching-${n}.md`), '');
    }
    const result = await resolveTaskFilesForPrompt(root, SLICE);
    expect(result?.endsWith('-9.md, user/tasks/127-tasks.pan-to-load-range-fetching-10.md')).toBe(true);
  });

  it('returns the single path for an unsplit file', async () => {
    writeFileSync(join(tasksDir, '127-tasks.pan-to-load-range-fetching.md'), '');
    expect(await resolveTaskFilesForPrompt(root, SLICE)).toBe(
      'user/tasks/127-tasks.pan-to-load-range-fetching.md',
    );
  });

  it('returns undefined when no task file exists', async () => {
    expect(await resolveTaskFilesForPrompt(root, SLICE)).toBeUndefined();
  });

  it('returns undefined when the slice has no index', async () => {
    expect(await resolveTaskFilesForPrompt(root, 'not-indexed')).toBeUndefined();
  });
});

describe('{task-files} template variable', () => {
  const base: ContextData = {
    projectName: 'p',
    template: '',
    fileSlice: SLICE,
    fileTasks: '127-tasks.pan-to-load-range-fetching',
    instruction: 'implementation',
    recentEvents: '',
    additionalNotes: '',
  };

  it('renders the resolved task files', () => {
    const out = new TemplateProcessor().processTemplate('Do {task-files}', {
      ...base,
      taskFiles: 'user/tasks/a-1.md, user/tasks/a-2.md',
    });
    expect(out).toBe('Do user/tasks/a-1.md, user/tasks/a-2.md');
  });

  it('leaves the placeholder visible when nothing was resolved', () => {
    expect(new TemplateProcessor().processTemplate('Do {task-files}', base)).toBe('Do {task-files}');
  });
});
