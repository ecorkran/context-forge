import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerAdoptedArtifacts } from '../../src/utils/registerAdoptedArtifacts.js';

// Slice 273 run defect (#137): a completed adoption leaves fileArch, fileSlicePlan and fileConcept
// unset, so `cf next` says "Create architecture document". The files are real, as in the run.

const PLAN = [
  '---\ndocType: slice-plan\nproject: adopted\n---\n\n# Slice Plan\n',
  '1. [x] **(100) Existing Core** `retroactive` — built before adoption.',
  '2. [ ] **(103) New Feature** — first new work.',
].join('\n');

function writeFile(root: string, relative: string, content: string): void {
  const path = join(root, relative);
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

function adoptedRoot(archStems: string[], withPlan = true): string {
  const root = mkdtempSync(join(tmpdir(), 'cf-register-'));
  for (const stem of archStems) {
    writeFile(root, `project-documents/user/architecture/${stem}.md`, '---\ndocType: architecture\nprovenance: derived\n---\n\n# Arch\n');
  }
  if (withPlan) writeFile(root, 'project-documents/user/architecture/100-slices.adopted.md', PLAN);
  writeFile(root, 'project-documents/user/project-guides/000-concept.adopted.md', '---\ndocType: concept\n---\n\n# Concept\n');
  return root;
}

describe('registerAdoptedArtifacts (#137)', () => {
  const setField = vi.fn<(field: string, value: string) => Promise<void>>();

  beforeEach(() => {
    vi.clearAllMocks();
    setField.mockResolvedValue(undefined);
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  it('sets arch and concept as stems when both are unset after a completed adoption', async () => {
    const root = adoptedRoot(['100-arch.adopted']);

    const changed = await registerAdoptedArtifacts({ projectPath: root }, setField);

    expect(changed).toBe(true);
    expect(setField.mock.calls).toEqual([
      ['arch', '100-arch.adopted'],
      ['concept', '000-concept.adopted'],
    ]);
  });

  it('leaves fields that are already set alone', async () => {
    const root = adoptedRoot(['100-arch.adopted']);

    const changed = await registerAdoptedArtifacts(
      { projectPath: root, fileArch: '100-arch.adopted', fileConcept: '000-concept.adopted' },
      setField,
    );

    expect(changed).toBe(false);
    expect(setField).not.toHaveBeenCalled();
  });

  it('does not guess between several derived architectures, and says so', async () => {
    const root = adoptedRoot(['100-arch.adopted', '200-arch.other']);

    await registerAdoptedArtifacts({ projectPath: root, fileConcept: '000-concept.adopted' }, setField);

    expect(setField).not.toHaveBeenCalled();
    const note = vi.mocked(process.stderr.write).mock.calls.map((call) => String(call[0])).join('');
    expect(note).toContain('100-arch.adopted');
    expect(note).toContain('200-arch.other');
  });

  it('does nothing while adoption is incomplete (derived architecture, no existing-state plan)', async () => {
    const root = adoptedRoot(['100-arch.adopted'], false);

    const changed = await registerAdoptedArtifacts({ projectPath: root }, setField);

    expect(changed).toBe(false);
    expect(setField).not.toHaveBeenCalled();
  });
});
