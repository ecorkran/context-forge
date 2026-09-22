import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * #97: `cf list arch` reported "No initiatives found" from a worktree against a
 * populated initiative plan.
 *
 * The mechanism is the opposite of this slice's other defects — arch.ts
 * resolved the worktree correctly, then applied the worktree's *slice* index
 * range to *initiative* indices. An initiative plan is a project-level
 * artifact, so nothing should be range-filtered (D7).
 *
 * TWO worktrees are required throughout: getWorktreeIndexRange returns
 * undefined for a single-worktree project, so a one-worktree fixture passes
 * against the broken code.
 */

const mockGetById = vi.fn();
const mockResolveProjectWorktree = vi.fn();

vi.mock('@context-forge/core/node', async () => {
  const actual = await vi.importActual('@context-forge/core/node');
  return {
    ...actual,
    FileProjectStore: class {
      getById = mockGetById;
      getAll = vi.fn().mockResolvedValue([]);
    },
  };
});

vi.mock('../../src/utils/project.js', async () => {
  const actual = await vi.importActual('../../src/utils/project.js');
  return {
    ...actual,
    resolveProjectWorktree: (...args: unknown[]) => mockResolveProjectWorktree(...args),
  };
});

import { archListAction } from '../../src/commands/arch.js';

/** Initiative plan entries are indexed in the hundreds: 200, 700, 900. */
function writeInitiativePlan(root: string): void {
  const dir = join(root, 'project-documents', 'user', 'project-guides');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, '001-initiative-plan.product.md'),
    [
      '---',
      'docType: initiative-plan',
      'project: scratch',
      '---',
      '',
      '# Initiative Plan',
      '',
      '1. [x] **(200) Foundation** — the first initiative.',
      '2. [ ] **(700) Reporting** — a later initiative.',
      '3. [ ] **(900) Maintenance** — the current one.',
      '',
    ].join('\n'),
  );
}

describe('cf list arch does not range-filter initiatives (#97)', () => {
  let root: string;
  let project: Record<string, unknown>;
  let output: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    root = realpathSync(mkdtempSync(join(tmpdir(), 'cf-arch-wt-')));
    writeInitiativePlan(root);

    // Two worktrees with disjoint slice bands. Worktree beta owns 900-999, so
    // under the old behavior initiatives 200 and 700 fell outside its range and
    // vanished — and with a single worktree the range is undefined, which is
    // why this fixture needs two.
    project = {
      id: 'proj_scratch',
      name: 'scratch-project',
      template: 'default',
      projectPath: root,
      worktrees: [
        { id: 'wt_alpha', name: 'alpha', indexRange: [200, 299], worktreePath: root },
        { id: 'wt_beta', name: 'beta', indexRange: [900, 999], worktreePath: root },
      ],
    };
    mockGetById.mockResolvedValue(project);

    output = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      output.push(String(chunk));
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });

  function text(): string {
    return output.join('\n');
  }

  it('lists every initiative from a worktree whose band excludes most of them', async () => {
    mockResolveProjectWorktree.mockResolvedValue({ id: 'proj_scratch', worktreeId: 'wt_beta' });

    await archListAction({});

    // Before the fix, beta's 900-999 band hid 200 and 700 and the command
    // printed "No initiatives found" when the band matched nothing at all.
    expect(text()).toContain('Foundation');
    expect(text()).toContain('Reporting');
    expect(text()).toContain('Maintenance');
  });

  it('lists every initiative from a worktree whose band matches none of them', async () => {
    // alpha owns 200-299; initiative indices 700 and 900 are outside it.
    mockResolveProjectWorktree.mockResolvedValue({ id: 'proj_scratch', worktreeId: 'wt_alpha' });

    await archListAction({});

    expect(text()).toContain('Foundation');
    expect(text()).toContain('Reporting');
    expect(text()).toContain('Maintenance');
    expect(text()).not.toContain('No initiatives');
  });

  it('gives identical output from a worktree and with --all', async () => {
    mockResolveProjectWorktree.mockResolvedValue({ id: 'proj_scratch', worktreeId: 'wt_beta' });
    await archListAction({ json: true });
    const fromWorktree = text();

    output = [];
    await archListAction({ json: true, all: true });
    const fromAll = text();

    expect(fromWorktree).toBe(fromAll);
  });

  it('names the plan file when it genuinely holds no initiatives (D8)', async () => {
    const dir = join(root, 'project-documents', 'user', 'project-guides');
    writeFileSync(
      join(dir, '001-initiative-plan.product.md'),
      '---\ndocType: initiative-plan\nproject: scratch\n---\n\n# Initiative Plan\n\n',
    );
    mockResolveProjectWorktree.mockResolvedValue({ id: 'proj_scratch', worktreeId: 'wt_beta' });

    await archListAction({});

    // "Empty" and "filtered out" were indistinguishable before; nothing is
    // filtered now, so the message can point at the file to check.
    expect(text()).toContain('001-initiative-plan.product.md');
  });

  it('is unaffected by worktree for a single-checkout project', async () => {
    mockGetById.mockResolvedValue({
      id: 'proj_scratch',
      name: 'scratch-project',
      template: 'default',
      projectPath: root,
    });
    mockResolveProjectWorktree.mockResolvedValue({ id: 'proj_scratch', worktreeId: undefined });

    await archListAction({});

    expect(text()).toContain('Foundation');
    expect(text()).toContain('Maintenance');
  });
});
