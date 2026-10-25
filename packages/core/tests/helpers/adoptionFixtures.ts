// Fixtures for adoption navigation tests (slice 264): a temp checkout with an adoption state
// and the artifacts a brownfield adoption writes, plus a matching ProjectData builder.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectData } from '../../src/types/project.js';

const MARKER = '`retroactive`';
const GUIDES_DIR = ['project-documents', 'user', 'project-guides'];
const ARCH_DIR = ['project-documents', 'user', 'architecture'];

export const CONCEPT_FILE = '000-concept.existing.md';
export const ARCH_FILE = '100-arch.existing.md';
export const PLAN_FILE = '100-slices.existing.md';
export const OTHER_PLAN_FILE = '200-slices.other.md';

export interface PlanEntrySpec {
  index: number;
  name: string;
  retroactive: boolean;
  checked: boolean;
}

/** Two recorded-history entries (100, 101) and one new, unchecked entry (102). */
export const MIXED_ENTRIES: PlanEntrySpec[] = [
  { index: 100, name: 'Existing System', retroactive: true, checked: true },
  { index: 101, name: 'Existing Tooling', retroactive: true, checked: true },
  { index: 102, name: 'New Work', retroactive: false, checked: false },
];

/** Every entry is recorded history: the adopted project has no new work yet. */
export const ALL_RETROACTIVE_ENTRIES: PlanEntrySpec[] = MIXED_ENTRIES.slice(0, 2);

export interface AdoptionFixtureOptions {
  /** adoption.state written to .context-forge.toml; omitted means no [adoption] section. */
  state?: string;
  concept?: boolean;
  /** Writes 100-arch.existing.md with provenance: derived. */
  arch?: boolean;
  /** Writes 100-slices.existing.md with these entries. */
  plan?: PlanEntrySpec[];
  /** Writes 200-slices.other.md, an ordinary plan with one new entry. */
  otherPlan?: boolean;
  /** Writes src/big.ts with this many non-blank source lines. */
  sourceLines?: number;
}

export interface AdoptionFixture {
  root: string;
  /** ProjectData for this checkout; pass overrides such as `instruction` or `fileSlicePlan`. */
  project(overrides?: Partial<ProjectData>): ProjectData;
  /** Raw bytes of .context-forge.toml, for read-only assertions. */
  configBytes(): string;
}

function write(root: string, dir: string[], name: string, body: string): void {
  mkdirSync(join(root, ...dir), { recursive: true });
  writeFileSync(join(root, ...dir, name), body);
}

function frontmatter(docType: string, extra = ''): string {
  return `---\ndocType: ${docType}\nproject: scratch-project\n${extra}---\n\n`;
}

function entryLine(entry: PlanEntrySpec): string {
  const box = entry.checked ? 'x' : ' ';
  const marker = entry.retroactive ? ` ${MARKER}` : '';
  return `${entry.index - 99}. [${box}] **(${entry.index}) ${entry.name}**${marker} — description.\n`;
}

export function createAdoptionFixture(options: AdoptionFixtureOptions = {}): AdoptionFixture {
  const root = mkdtempSync(join(tmpdir(), 'cf-adoption-nav-'));
  const configPath = join(root, '.context-forge.toml');
  writeFileSync(configPath, options.state === undefined ? '' : `[adoption]\nstate = "${options.state}"\n`);

  if (options.concept) write(root, GUIDES_DIR, CONCEPT_FILE, frontmatter('concept') + '# Concept\n');
  if (options.arch) {
    write(root, ARCH_DIR, ARCH_FILE, frontmatter('architecture', 'provenance: derived\n') + '# Architecture\n');
  }
  if (options.plan) {
    const body = options.plan.map(entryLine).join('');
    write(root, ARCH_DIR, PLAN_FILE, frontmatter('slice-plan') + `# Slice Plan\n\n${body}`);
  }
  if (options.otherPlan) {
    const body = entryLine({ index: 200, name: 'Other Work', retroactive: false, checked: false });
    write(root, ARCH_DIR, OTHER_PLAN_FILE, frontmatter('slice-plan') + `# Slice Plan\n\n${body}`);
  }

  if (options.sourceLines !== undefined) {
    const body = Array.from({ length: options.sourceLines }, (_, i) => `export const v${i} = ${i};`).join('\n');
    write(root, ['src'], 'big.ts', body);
  }

  return {
    root,
    project: (overrides = {}) => ({
      id: 'project_adoption',
      name: 'scratch-project',
      template: 'default',
      instruction: 'Phase 0: Concept',
      developmentPhase: 'Phase 0: Concept',
      createdAt: '2026-01-01',
      updatedAt: '2026-02-28',
      projectPath: root,
      ...overrides,
    }),
    configBytes: () => readFileSync(configPath, 'utf8'),
  };
}
