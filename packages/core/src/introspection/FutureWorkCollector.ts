import { basename } from 'node:path';
import { buildModel } from './ProjectModelBuilder.js';
import type {
  CollectedFutureWorkItem,
  FutureWorkCollectorResult,
  FutureWorkGroup,
  SlicePlanEntry,
} from './types.js';

type StatusFilter = 'all' | 'pending' | 'completed';

const EMPTY_RESULT = (projectPath: string): FutureWorkCollectorResult => ({
  projectPath,
  groups: [],
  totalItems: 0,
  pendingItems: 0,
  completedItems: 0,
  markdown: '## Future Work\n\n*No future work items found.*',
});

function pad(index: number): string {
  return String(index).padStart(3, '0');
}

function generateMarkdown(
  groups: FutureWorkGroup[],
  totals: { total: number; pending: number; completed: number },
): string {
  const lines: string[] = ['## Future Work Summary', ''];

  for (const group of groups) {
    if (group.items.length === 0) continue;
    lines.push(`### ${group.initiativeIndex} — ${group.initiativeName}`);
    lines.push(`*Source: ${group.sourceFile}*`);
    for (const item of group.items) {
      const box = item.done ? '[x]' : '[ ]';
      lines.push(`- ${box} (${item.index}) ${item.name}`);
    }
    lines.push('');
  }

  lines.push(`**Total: ${totals.total} items (${totals.pending} pending, ${totals.completed} completed)**`);
  return lines.join('\n');
}

export class FutureWorkCollector {
  async collect(
    projectPath: string,
    statusFilter: StatusFilter = 'all',
  ): Promise<FutureWorkCollectorResult> {
    let model;
    try {
      model = await buildModel(projectPath);
    } catch {
      return EMPTY_RESULT(projectPath);
    }

    const groups: FutureWorkGroup[] = [];

    for (const [initIndex, initiative] of Object.entries(model.initiatives)) {
      const { slicePlan } = initiative;
      if (!slicePlan) continue;

      const filepath = slicePlan.filepath ?? '';
      const sourceFile = filepath
        ? filepath.replace(projectPath + '/', '').replace(projectPath, '')
        : slicePlan.name;

      let rawItems: CollectedFutureWorkItem[];

      // Standalone detection: filename contains 'slices.future.'
      if (basename(filepath).includes('slices.future.')) {
        const entries: SlicePlanEntry[] = slicePlan.entries ?? [];
        rawItems = entries.map((e) => ({
          index: pad(e.index),
          name: e.name,
          done: e.isChecked,
          sourceFile,
          sourceInitiativeIndex: initIndex,
          sourceInitiativeName: initiative.name,
        }));
      } else {
        rawItems = (slicePlan.futureWork ?? []).map((fw) => ({
          index: fw.index,
          name: fw.name,
          done: fw.done,
          sourceFile,
          sourceInitiativeIndex: initIndex,
          sourceInitiativeName: initiative.name,
        }));
      }

      if (rawItems.length === 0) continue;

      // Apply status filter
      const items =
        statusFilter === 'pending'
          ? rawItems.filter((i) => !i.done)
          : statusFilter === 'completed'
            ? rawItems.filter((i) => i.done)
            : rawItems;

      if (items.length === 0) continue;

      const completedItems = items.filter((i) => i.done).length;
      const pendingItems = items.length - completedItems;

      groups.push({
        initiativeIndex: initIndex,
        initiativeName: initiative.name,
        sourceFile,
        items,
        totalItems: items.length,
        pendingItems,
        completedItems,
      });
    }

    // Sort groups by initiative index for deterministic output
    groups.sort((a, b) => a.initiativeIndex.localeCompare(b.initiativeIndex));

    const totalItems = groups.reduce((s, g) => s + g.totalItems, 0);
    const pendingItems = groups.reduce((s, g) => s + g.pendingItems, 0);
    const completedItems = groups.reduce((s, g) => s + g.completedItems, 0);

    if (totalItems === 0) {
      return EMPTY_RESULT(projectPath);
    }

    const markdown = generateMarkdown(groups, {
      total: totalItems,
      pending: pendingItems,
      completed: completedItems,
    });

    return {
      projectPath,
      groups,
      totalItems,
      pendingItems,
      completedItems,
      markdown,
    };
  }
}
