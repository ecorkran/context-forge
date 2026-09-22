import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerValidateCommand } from '../../src/commands/validate.js';

/**
 * Integration coverage for #88: `cf validate frontmatter` must examine the
 * worktree the caller is in, not the project root.
 *
 * Unlike validate.test.ts, this suite does NOT mock validateFrontmatterFiles —
 * the whole defect is the path argument handed to it, which a mock cannot see.
 * Real directories, real fixtures, real validator.
 */

const mockGetAll = vi.fn();
const mockGetById = vi.fn();

vi.mock('@context-forge/core/node', async () => {
  const actual = await vi.importActual<typeof import('@context-forge/core/node')>(
    '@context-forge/core/node',
  );
  return {
    ...actual,
    // A plain class, not vi.fn().mockImplementation — restoreAllMocks() in
    // afterEach would strip the implementation and later tests would get a
    // bare mock whose store has no getAll.
    FileProjectStore: class {
      getAll = mockGetAll;
      getById = mockGetById;
    },
  };
});

/** A document whose frontmatter is valid, so findings stay empty and filesChecked is the signal. */
function writeSliceDoc(root: string, name: string): string {
  const dir = join(root, 'project-documents/user/slices');
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, name);
  writeFileSync(
    filePath,
    [
      '---',
      'docType: slice',
      'project: wt-test',
      'dateCreated: 20260922',
      'dateUpdated: 20260922',
      'status: in_progress',
      '---',
      '',
      '# A slice',
      '',
    ].join('\n'),
  );
  return filePath;
}

describe('cf validate frontmatter — worktree scoping (#88)', () => {
  let tmpRoot: string;
  let projectRoot: string;
  let worktreeAlpha: string;
  let worktreeBeta: string;
  let project: Record<string, unknown>;
  let originalCwd: string;
  let jsonOutput: string;
  let capturedErrors: string[];

  beforeEach(() => {
    capturedErrors = [];
    originalCwd = process.cwd();
    // realpath: on macOS process.cwd() reports /private/var while mkdtemp
    // returns /var, and the resolver compares paths as strings.
    tmpRoot = realpathSync(mkdtempSync(join(tmpdir(), 'cf-wt-validate-')));

    // TWO worktrees: getWorktreeIndexRange returns undefined for a lone
    // worktree, so a single-worktree fixture can pass against broken code.
    projectRoot = join(tmpRoot, 'main-checkout');
    worktreeAlpha = join(tmpRoot, 'wt-alpha');
    worktreeBeta = join(tmpRoot, 'wt-beta');

    // Distinct counts per root. Equal counts would let a wrong root still
    // produce the expected number — the count must identify the root.
    writeSliceDoc(projectRoot, '100-slice.in-main.md');
    writeSliceDoc(projectRoot, '101-slice.in-main-two.md');
    writeSliceDoc(projectRoot, '102-slice.in-main-three.md');
    writeSliceDoc(worktreeAlpha, '200-slice.in-alpha.md');
    writeSliceDoc(worktreeBeta, '300-slice.in-beta.md');
    writeSliceDoc(worktreeBeta, '301-slice.in-beta-two.md');

    project = {
      id: 'proj_wt',
      name: 'wt-test',
      template: 'default',
      projectPath: projectRoot,
      worktrees: [
        {
          id: 'wt_alpha',
          name: 'alpha',
          indexRange: [200, 299],
          worktreePath: worktreeAlpha,
        },
        {
          id: 'wt_beta',
          name: 'beta',
          indexRange: [300, 399],
          worktreePath: worktreeBeta,
        },
      ],
    };

    mockGetAll.mockResolvedValue([project]);
    mockGetById.mockResolvedValue(project);

    jsonOutput = '';
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      capturedErrors.push(args.map(String).join(' '));
    });
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      jsonOutput += String(chunk);
      return true;
    });
    // handleError calls process.exit; surface the captured stderr instead of
    // tearing down the worker with an opaque exit code.
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(
        `cf exited ${code}: ${capturedErrors.join(' | ') || '(no stderr captured)'}`,
      );
    }) as never);
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  function createProgram(): Command {
    const program = new Command();
    program.exitOverride();
    registerValidateCommand(program);
    return program;
  }

  function parseJsonOutput(): { filesChecked: number; totalFindings: number } {
    if (!jsonOutput) {
      throw new Error(`no JSON on stdout; stderr was: ${capturedErrors.join(' | ') || '(empty)'}`);
    }
    return JSON.parse(jsonOutput);
  }

  /**
   * Fixture paths come from the registered worktree records, never rebuilt the
   * way the product builds them. A test that derives its expected root the same
   * way the code under test does passes against the unfixed code — that is how
   * this bug survived.
   */
  function registeredWorktreePath(worktreeId: string): string {
    const worktrees = project.worktrees as Array<{ id: string; worktreePath: string }>;
    const wt = worktrees.find((w) => w.id === worktreeId);
    if (!wt) throw new Error(`fixture error: no worktree ${worktreeId}`);
    return wt.worktreePath;
  }

  it('checks an explicit path inside the non-default worktree', async () => {
    const alphaRoot = registeredWorktreePath('wt_alpha');
    const target = join(alphaRoot, 'project-documents/user/slices/200-slice.in-alpha.md');
    process.chdir(alphaRoot);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--json', target]);

    // Before the fix this was 0: the file failed containment against the
    // project root's document root and was silently dropped.
    expect(parseJsonOutput().filesChecked).toBe(1);
  });

  it('walks the worktree, not the project root, when no paths are given', async () => {
    const betaRoot = registeredWorktreePath('wt_beta');
    process.chdir(betaRoot);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--json']);

    // Beta holds 2 docs; the project root holds 3. Walking the wrong root
    // yields 3, so this count names the root that was actually walked.
    expect(parseJsonOutput().filesChecked).toBe(2);
  });

  it('still walks the project root from the main checkout', async () => {
    process.chdir(projectRoot);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--json']);

    expect(parseJsonOutput().filesChecked).toBe(3);
  });

  it('does not reach across worktrees: a beta path is not checked from alpha', async () => {
    const betaDoc = join(
      registeredWorktreePath('wt_beta'),
      'project-documents/user/slices/300-slice.in-beta.md',
    );

    // Same file, two vantage points. Pairing them means a bug that returns
    // zero for everything cannot satisfy this test.
    process.chdir(registeredWorktreePath('wt_alpha'));
    const fromAlpha = createProgram();
    await fromAlpha.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--json', betaDoc]);
    // Out of the resolved root: correctly skipped. Part 3 gives this a reason
    // rather than a bare zero.
    expect(parseJsonOutput().filesChecked).toBe(0);

    jsonOutput = '';
    process.chdir(registeredWorktreePath('wt_beta'));
    const fromBeta = createProgram();
    await fromBeta.parseAsync(['node', 'cf', 'validate', 'frontmatter', '--json', betaDoc]);
    expect(parseJsonOutput().filesChecked).toBe(1);
  });
});
