import { readFile } from 'node:fs/promises';
import { STATUS } from '../types.js';
import type { TaskItem, TaskFileResult } from '../types.js';

/** Matches `- [ ] text` and `- [x] text` at any indentation level (from parse.py) */
const CHECKBOX_RE = /^(?:\s*)-\s+\[([ xX])\]\s+(.+)$/;

/** Maximum task name length before truncation (matching parse.py) */
const MAX_NAME_LENGTH = 120;

/**
 * Extract checkbox items from a single task file.
 * A missing file (ENOENT) is a normal "no task file" signal and returns an
 * empty array. Any other read failure (permission denied, EISDIR, etc.) is a
 * genuine resolution failure and propagates — callers must not conflate it
 * with "no task file" (TD-2a: a resolution failure is never coerced to absent).
 */
export async function parseTaskItems(filePath: string): Promise<TaskItem[]> {
  const items: TaskItem[] = [];
  let content: string;
  try {
    content = await readFile(filePath, 'utf-8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return items;
    }
    throw err;
  }
  for (const line of content.split('\n')) {
    const m = CHECKBOX_RE.exec(line);
    if (m) {
      let name = m[2].trim();
      if (name.length > MAX_NAME_LENGTH) {
        name = name.slice(0, MAX_NAME_LENGTH - 3) + '...';
      }
      items.push({ name, done: m[1].toLowerCase() === 'x' });
    }
  }
  return items;
}

/**
 * Parse one or more task files, merge items, compute counts and inferred status.
 * For multiple files (split support): merge items in path order, use first file's path.
 * Propagates a genuine read failure from parseTaskItems (see above); only a
 * missing file is treated as "no tasks".
 */
export async function parseTaskFile(filePaths: string | string[]): Promise<TaskFileResult> {
  const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
  const primaryPath = paths[0] ?? '';

  const allItems: TaskItem[] = [];
  for (const p of paths) {
    const items = await parseTaskItems(p);
    allItems.push(...items);
  }

  const totalTasks = allItems.length;
  const completedTasks = allItems.filter((item) => item.done).length;

  let inferredStatus: TaskFileResult['inferredStatus'];
  if (totalTasks === 0) {
    inferredStatus = STATUS.NotStarted;
  } else if (completedTasks === totalTasks) {
    inferredStatus = STATUS.Complete;
  } else if (completedTasks > 0) {
    inferredStatus = STATUS.InProgress;
  } else {
    inferredStatus = STATUS.NotStarted;
  }

  return {
    filePath: primaryPath,
    items: allItems,
    totalTasks,
    completedTasks,
    inferredStatus,
  };
}
