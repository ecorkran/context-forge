import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findExistingStatePlan } from '../../src/introspection/parsers/existingStatePlan.js';

// Plan lines use slice 263's Marker Specification form exactly.
const RETROACTIVE_ENTRY = '1. [x] **(100) Existing System** `retroactive` — built before adoption.';
const ORDINARY_ENTRY = '1. [ ] **(101) New Work** — not built yet.';

function planFile(entry: string): string {
  return `---\ndocType: slice-plan\nproject: scratch\n---\n\n## Slice List\n\n${entry}\n`;
}

describe('findExistingStatePlan', () => {
  let root: string;
  const guides = (): string => join(root, 'project-documents/user/project-guides');
  const arch = (): string => join(root, 'project-documents/user/architecture');

  async function put(dir: string, name: string, content: string): Promise<string> {
    await mkdir(dir, { recursive: true });
    const path = join(dir, name);
    await writeFile(path, content);
    return path;
  }

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'cf-existing-plan-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('returns null when there is no plan', async () => {
    expect(await findExistingStatePlan(root)).toBeNull();
  });

  it('returns null for a plan with only ordinary entries', async () => {
    await put(arch(), '100-slices.a.md', planFile(ORDINARY_ENTRY));
    expect(await findExistingStatePlan(root)).toBeNull();
  });

  it('returns the plan that holds a retroactive entry', async () => {
    const path = await put(arch(), '100-slices.a.md', planFile(RETROACTIVE_ENTRY));
    expect(await findExistingStatePlan(root)).toBe(path);
  });

  it('returns the lowest-index plan when two carry markers', async () => {
    // The lower index sits in the directory that sorts later by full path, so only index order passes.
    await put(arch(), '200-slices.b.md', planFile(RETROACTIVE_ENTRY));
    const lowest = await put(guides(), '100-slices.a.md', planFile(RETROACTIVE_ENTRY));
    expect(await findExistingStatePlan(root)).toBe(lowest);
  });

  it('ignores a retroactive line inside an architecture file', async () => {
    await put(arch(), '100-arch.a.md', planFile(RETROACTIVE_ENTRY));
    expect(await findExistingStatePlan(root)).toBeNull();
  });

  it('skips a plan that cannot be read and returns the readable marked one (D7)', async () => {
    // A directory with a plan's name matches the filename pattern but cannot be read as a file.
    await mkdir(join(arch(), '100-slices.unreadable.md'), { recursive: true });
    const readable = await put(arch(), '200-slices.ok.md', planFile(RETROACTIVE_ENTRY));
    expect(await findExistingStatePlan(root)).toBe(readable);
  });
});
