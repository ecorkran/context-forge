import { readFile } from 'node:fs/promises';
import type { TaskItem, TaskFileResult } from '../types.js';

/** Matches `- [ ] text` and `- [x] text` at any indentation level (from parse.py) */
const CHECKBOX_RE = /^(?:\s*)-\s+\[([ xX])\]\s+(.+)$/;

/** Maximum task name length before truncation (matching parse.py) */
const MAX_NAME_LENGTH = 120;

/**
 * Extract checkbox items from a single task file.
 * Never throws — returns empty array on error.
 */
export async function parseTaskItems(filePath: string): Promise<TaskItem[]> {
  const items: TaskItem[] = [];
  try {
    const content = await readFile(filePath, 'utf-8');
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
  } catch {
    // Missing/unreadable file: return empty
  }
  return items;
}

/**
 * Parse one or more task files, merge items, compute counts and inferred status.
 * For multiple files (split support): merge items in path order, use first file's path.
 * Never throws — returns empty result on error.
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
    inferredStatus = 'not-started';
  } else if (completedTasks === totalTasks) {
    inferredStatus = 'complete';
  } else if (completedTasks > 0) {
    inferredStatus = 'in-progress';
  } else {
    inferredStatus = 'not-started';
  }

  return {
    filePath: primaryPath,
    items: allItems,
    totalTasks,
    completedTasks,
    inferredStatus,
  };
}
