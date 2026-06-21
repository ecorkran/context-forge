import { readdir, access } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { parseFrontmatter } from './parsers/frontmatterParser.js';
import { extractOverview } from './parsers/overviewParser.js';
import { parseTaskItems } from './parsers/taskFileParser.js';
import { parseFutureWork } from './parsers/futureWorkParser.js';
import { parseSlicePlan } from './parsers/slicePlanParser.js';
import { normalizeStatus } from './parsers/statusNormalizer.js';
import { resolveInitiativePlanPath } from './ArtifactIntrospector.js';
import type {
  TaskItem,
  ProjectModel,
  FoundationEntry,
  ArchEntry,
  Initiative,
  SliceModelEntry,
  TaskModelEntry,
  SlicePlanBlock,
  DocSummary,
  FutureSliceEntry,
  MaintenanceEntry,
} from './types.js';

/** Deduplicate DocSummary-like arrays by name field (first wins). */
function dedupeByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.name)) return false;
    seen.add(item.name);
    return true;
  });
}

/**
 * Merge multiple ProjectModel objects into one (for --all aggregation).
 * Deduplicates initiatives by index key (first wins), arrays by name.
 */
export function mergeProjectModels(models: ProjectModel[]): ProjectModel {
  if (models.length === 0) throw new Error('No models to merge');
  if (models.length === 1) return models[0];

  const merged: ProjectModel = {
    name: models[0].name,
    description: models[0].description,
    foundation: [],
    projectArchitecture: [],
    initiatives: {},
    maintenanceInitiatives: {},
    futureSlices: [],
    quality: [],
    investigation: [],
    maintenance: [],
    devlog: models.some((m) => m.devlog),
  };

  for (const model of models) {
    merged.foundation.push(...model.foundation);
    merged.projectArchitecture.push(...model.projectArchitecture);
    merged.futureSlices.push(...model.futureSlices);
    merged.quality.push(...model.quality);
    merged.investigation.push(...model.investigation);
    merged.maintenance.push(...model.maintenance);

    for (const [key, init] of Object.entries(model.initiatives)) {
      if (!merged.initiatives[key]) {
        merged.initiatives[key] = init;
      }
    }
    for (const [key, init] of Object.entries(model.maintenanceInitiatives)) {
      if (!merged.maintenanceInitiatives[key]) {
        merged.maintenanceInitiatives[key] = init;
      }
    }
  }

  // Deduplicate arrays by name
  merged.foundation = dedupeByName(merged.foundation);
  merged.projectArchitecture = dedupeByName(merged.projectArchitecture);
  merged.futureSlices = dedupeByName(merged.futureSlices);
  merged.quality = dedupeByName(merged.quality);
  merged.investigation = dedupeByName(merged.investigation);
  merged.maintenance = dedupeByName(merged.maintenance);

  return merged;
}

const USER_DOCS = 'project-documents/user';

// Subdirectories scanned under user/ (matching parse.py order)
const SCAN_DIRS = [
  'architecture',
  'slices',
  'tasks',
  'features',
  'project-guides',
  'reviews',
  'analysis',
  'maintenance',
] as const;

/** Matches indexed methodology filenames: NNN-type.name[-N].md */
const INDEXED_RE = /^(\d{3})-(arch|slices|slice|tasks|feature|issue|review|analysis|concept|spec|hld)\.(.+?)(?:-(\d+))?\.md$/i;

/** Fallback for project-guides: NNN-type.name.md */
const GUIDE_RE = /^(\d{3})-(concept|spec|hld|slices|guide)\.(.+?)\.md$/i;

/** Intermediate document entry from directory scanning */
interface DocEntry {
  index: number;
  docType: string;
  name: string;
  filename: string;
  filepath: string;
  status: string;
  dateCreated?: string;
  dateUpdated?: string;
  project?: string;
  parent?: string;
  description?: string;
  taskItems: TaskItem[];
  splitNum?: number;
}

/** Safe directory listing — returns empty on error */
async function safeReaddir(dirPath: string): Promise<string[]> {
  try {
    return await readdir(dirPath);
  } catch {
    return [];
  }
}

/** Check file existence */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Scan project-documents/user/ subdirectories for methodology documents.
 * Exported for testing — not part of public API.
 */
export async function scanDirectory(userDir: string): Promise<DocEntry[]> {
  const docs: DocEntry[] = [];

  for (const subdir of SCAN_DIRS) {
    const dirPath = join(userDir, subdir);
    const files = await safeReaddir(dirPath);

    for (const filename of files) {
      if (!filename.endsWith('.md')) continue;

      let m = INDEXED_RE.exec(filename);
      let splitNum: number | undefined;

      if (!m) {
        // Try guide regex for project-guides
        m = GUIDE_RE.exec(filename);
        if (!m) continue;
      } else {
        splitNum = m[4] ? parseInt(m[4], 10) : undefined;
      }

      const index = parseInt(m[1], 10);
      const docType = m[2].toLowerCase();
      const name = m[3];
      const filepath = join(dirPath, filename);

      // Parse frontmatter
      const fm = await parseFrontmatter(filepath);
      const status = normalizeStatus(fm.data.status);

      // Parse task items for task docs
      let taskItems: TaskItem[] = [];
      if (docType === 'tasks') {
        taskItems = await parseTaskItems(filepath);
      }

      // Extract overview paragraph for arch docs (used as description in model)
      let description = fm.data.description || undefined;
      if (!description && docType === 'arch') {
        description = await extractOverview(filepath);
      }

      docs.push({
        index,
        docType,
        name,
        filename,
        filepath,
        status,
        dateCreated: fm.data.dateCreated || undefined,
        dateUpdated: fm.data.dateUpdated || undefined,
        project: fm.data.project || undefined,
        parent: fm.data.parent || undefined,
        description,
        taskItems,
        splitNum,
      });
    }
  }

  return docs;
}

/** Format index as zero-padded string (matching parse.py f"{doc.index:03d}") */
function pad(index: number): string {
  return String(index).padStart(3, '0');
}

/** Convert DocEntry to base DocSummary shape (matching parse.py _d()) */
function toDocSummary(doc: DocEntry): DocSummary {
  const result: DocSummary = {
    index: pad(doc.index),
    name: doc.name,
    status: doc.status,
  };
  if (doc.dateCreated) result.dateCreated = doc.dateCreated;
  if (doc.dateUpdated) result.dateUpdated = doc.dateUpdated;
  if (doc.description) result.description = doc.description;
  return result;
}

/** Title-case a string: hyphens/underscores/dots → spaces, capitalize words */
function titleCase(s: string): string {
  return s
    .replace(/[-_.]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build task entry from one or more task docs at the same index */
function buildTaskEntry(taskDocs: DocEntry[]): TaskModelEntry {
  const sorted = [...taskDocs].sort((a, b) => (a.splitNum ?? 0) - (b.splitNum ?? 0));
  const first = sorted[0];

  const allItems = sorted.flatMap((d) => d.taskItems);
  const taskCount = allItems.length;
  const completedTasks = allItems.filter((t) => t.done).length;

  // Infer status from checkboxes if frontmatter says not-started
  let status = first.status;
  if (status === 'not-started' && taskCount > 0) {
    if (completedTasks === taskCount) status = 'complete';
    else if (completedTasks > 0) status = 'in-progress';
  }

  const entry: TaskModelEntry = {
    index: pad(first.index),
    name: `tasks.${first.name}`,
    status,
    taskCount,
    completedTasks,
  };
  if (first.dateCreated) entry.dateCreated = first.dateCreated;
  if (first.dateUpdated) entry.dateUpdated = first.dateUpdated;
  if (allItems.length > 0) entry.items = allItems;
  return entry;
}

/**
 * Build the full project model from a project root path.
 * Replicates parse.py's build_model() logic.
 */
export async function buildModel(
  projectPath: string,
  options?: { name?: string; description?: string },
): Promise<ProjectModel> {
  const userDir = join(projectPath, USER_DOCS);
  const docs = await scanDirectory(userDir);

  // Infer project name: from first doc with project field, then directory name
  const projectDoc = docs.find((d) => d.project);
  const inferredName = options?.name ?? titleCase(projectDoc?.project ?? basename(projectPath));

  const model: ProjectModel = {
    name: inferredName,
    description: options?.description ?? '',
    foundation: [],
    projectArchitecture: [],
    initiatives: {},
    maintenanceInitiatives: {},
    futureSlices: [],
    quality: [],
    investigation: [],
    maintenance: [],
    devlog: false,
  };

  // Check DEVLOG.md at project root
  model.devlog = await fileExists(join(projectPath, 'DEVLOG.md'));

  // --- Foundation band (000-009) ---
  const foundationTypes = new Set(['concept', 'spec', 'hld', 'slices']);
  const foundationDocs = docs
    .filter((d) => d.index >= 0 && d.index <= 9 && foundationTypes.has(d.docType))
    .sort((a, b) => a.index - b.index || a.docType.localeCompare(b.docType));

  model.foundation = foundationDocs.map((d) => ({
    ...toDocSummary(d),
    type: d.docType,
  })) as FoundationEntry[];

  // --- Project architecture band (050-099) ---
  const archTypes = new Set(['arch', 'hld']);
  const projArchDocs = docs
    .filter((d) => d.index >= 50 && d.index <= 99 && archTypes.has(d.docType))
    .sort((a, b) => a.index - b.index);

  model.projectArchitecture = projArchDocs.map((d) => ({
    ...toDocSummary(d),
    type: (d.name.includes('hld') || d.docType === 'hld' ? 'hld' : 'arch') as 'hld' | 'arch',
  })) as ArchEntry[];

  // --- Initiative bands (100+, including 900+ maintenance initiatives) ---
  // Identify base indices from arch or slices docs
  const baseIndices = new Set<number>();
  for (const d of docs) {
    if (d.index >= 100 && (d.docType === 'arch' || d.docType === 'slices')) {
      baseIndices.add(d.index);
    }
  }

  const sortedBases = [...baseIndices].sort((a, b) => a - b);

  for (let i = 0; i < sortedBases.length; i++) {
    const base = sortedBases[i];
    const upper = i + 1 < sortedBases.length ? sortedBases[i + 1] : Infinity;

    const archDoc = docs.find((d) => d.index === base && d.docType === 'arch');
    const slicesDoc = docs.find((d) => d.index === base && d.docType === 'slices');

    const rawName = archDoc?.name ?? slicesDoc?.name ?? String(base);
    const initiative: Initiative = {
      name: titleCase(rawName),
      slices: [],
      features: [],
    };

    if (archDoc) {
      initiative.arch = toDocSummary(archDoc);
    }

    // Slice plan: parse both main-body entries and future work section
    let planEntries: import('./types.js').SlicePlanEntry[] = [];
    if (slicesDoc) {
      const [planResult, fwResult] = await Promise.all([
        parseSlicePlan(slicesDoc.filepath),
        parseFutureWork(slicesDoc.filepath, upper),
      ]);
      planEntries = planResult.entries;
      const planBlock: SlicePlanBlock = {
        ...toDocSummary(slicesDoc),
        filepath: slicesDoc.filepath,
        entries: planResult.entries,
        futureWork: fwResult.items,
      };
      initiative.slicePlan = planBlock;
    }

    // Collect actual slice docs in this band
    const bandSlices = docs
      .filter((d) => d.index >= base && d.index < upper && d.docType === 'slice')
      .sort((a, b) => a.index - b.index);

    // Collect task docs in this band (grouped by index)
    const bandTasks = docs.filter(
      (d) => d.index >= base && d.index < upper && d.docType === 'tasks',
    );
    const tasksByIndex = new Map<number, DocEntry[]>();
    for (const t of bandTasks) {
      const existing = tasksByIndex.get(t.index) ?? [];
      existing.push(t);
      tasksByIndex.set(t.index, existing);
    }

    // Collect feature/issue docs in this band (grouped by index)
    const bandFeatures = docs.filter(
      (d) =>
        d.index >= base &&
        d.index < upper &&
        (d.docType === 'feature' || d.docType === 'issue'),
    );
    const featuresByIndex = new Map<number, DocEntry[]>();
    for (const f of bandFeatures) {
      const existing = featuresByIndex.get(f.index) ?? [];
      existing.push(f);
      featuresByIndex.set(f.index, existing);
    }

    // Build slice entries
    const sliceIndices = new Set<number>(bandSlices.map((s) => s.index));

    for (const sliceDoc of bandSlices) {
      const entry: SliceModelEntry = toDocSummary(sliceDoc) as SliceModelEntry;

      // Attach tasks
      const tasks = tasksByIndex.get(sliceDoc.index);
      if (tasks && tasks.length > 0) {
        entry.tasks = buildTaskEntry(tasks);
      }

      // Attach features
      const features = featuresByIndex.get(sliceDoc.index);
      if (features && features.length > 0) {
        entry.features = features.map(toDocSummary);
      }

      initiative.slices.push(entry);
    }

    // Fill planned-but-unwritten slices from slice plan main body (matching parse.py)
    for (const entry of planEntries) {
      if (entry.index >= base && entry.index < upper && !sliceIndices.has(entry.index)) {
        initiative.slices.push({
          index: pad(entry.index),
          name: entry.name,
          status: entry.isChecked ? 'complete' : 'not-started',
          planned: true,
        });
      }
    }
    // Re-sort all slices by index
    initiative.slices.sort((a, b) => a.index.localeCompare(b.index));

    // Collect unclaimed features as futureSlices
    for (const [idx, feats] of featuresByIndex) {
      if (!sliceIndices.has(idx)) {
        for (const f of feats) {
          const entry: FutureSliceEntry = {
            ...toDocSummary(f),
            parent: pad(base),
          };
          model.futureSlices.push(entry);
        }
      }
    }

    model.initiatives[pad(base)] = initiative;
  }

  // --- Plan-only initiatives ---
  // The initiative plan is the authoritative roadmap: it names initiatives
  // before any arch or slices doc exists. Surface those so the model reflects
  // what is planned, not just what has been started. The plan uses the same
  // `N. [ ] **(NNN) Name** — overview` entry format as a slice plan. Entries at
  // 900+ flow into maintenanceInitiatives via the partition below, matching the
  // arch/slices loop (which also has no upper bound).
  const planPath = await resolveInitiativePlanPath(projectPath);
  if (planPath) {
    const { entries } = await parseSlicePlan(planPath);
    for (const entry of entries) {
      if (entry.index < 100) continue; // foundation/project-arch bands are not initiatives
      const key = pad(entry.index);
      if (model.initiatives[key]) continue; // arch/slices doc already produced it
      const initiative: Initiative = {
        name: titleCase(entry.name),
        slices: [],
        features: [],
        status: entry.status,
        planned: true,
      };
      if (entry.description) initiative.description = entry.description;
      model.initiatives[key] = initiative;
    }
  }

  // --- Partition 900+ initiatives into maintenanceInitiatives ---
  model.maintenanceInitiatives = {};
  for (const [key, init] of Object.entries(model.initiatives)) {
    if (parseInt(key, 10) >= 900) {
      model.maintenanceInitiatives[key] = init;
      delete model.initiatives[key];
    }
  }

  // --- Operational band (900+) ---
  // Quality: review docs 900+
  model.quality = docs
    .filter((d) => d.index >= 900 && d.docType === 'review')
    .sort((a, b) => a.index - b.index)
    .map(toDocSummary);

  // Investigation: all analysis docs (no index filter per parse.py)
  model.investigation = docs
    .filter((d) => d.docType === 'analysis')
    .sort((a, b) => a.index - b.index)
    .map(toDocSummary);

  // Maintenance: flat task list from 900+ (backward compat)
  model.maintenance = docs
    .filter((d) => d.index >= 900 && d.docType === 'tasks')
    .sort((a, b) => a.index - b.index)
    .map((d) => {
      const entry: MaintenanceEntry = toDocSummary(d);
      if (d.taskItems.length > 0) {
        entry.taskCount = d.taskItems.length;
        entry.completedTasks = d.taskItems.filter((t) => t.done).length;
      }
      return entry;
    });

  return model;
}
