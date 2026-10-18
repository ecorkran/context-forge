import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigManager } from '@context-forge/core/node';
import { registerValidateCommand } from '../../src/commands/validate.js';

/**
 * `cf validate design`, end to end through Commander with the real core
 * validator. Only the project store is mocked, so the template path the
 * command builds is exercised against real fixture checkouts.
 */

const mockGetAll = vi.fn();
const mockGetById = vi.fn();

vi.mock('@context-forge/core/node', async () => {
  const actual = await vi.importActual<typeof import('@context-forge/core/node')>(
    '@context-forge/core/node',
  );
  return {
    ...actual,
    // A plain class: restoreAllMocks() would strip a vi.fn() implementation.
    FileProjectStore: class {
      getAll = mockGetAll;
      getById = mockGetById;
    },
  };
});

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const GUIDE = 'project-documents/ai-project-guide';
const TEMPLATE_IN_GUIDE = 'project-guides/templates/slice-design.md';
const REAL_TEMPLATE = join(REPO_ROOT, GUIDE, TEMPLATE_IN_GUIDE);
const slicePath = (name: string): string => join(REPO_ROOT, 'project-documents/user/slices', name);

/** Real designs the guide's bash script passes today. */
const PASSING_DESIGNS = [
  '212-slice.guide-exclude-globs-for-tarball-installs.md',
  '213-slice.cf-check-fix-worktree-aware-writes.md',
  '214-slice.native-slice-design-validation.md',
  '928-slice.review-gate-provenance-and-exemption-visibility.md',
].map(slicePath);
const DESIGN_214 = slicePath('214-slice.native-slice-design-validation.md');

/** Copy the real template into a checkout's guide. */
function installTemplate(checkoutRoot: string): string {
  const target = join(checkoutRoot, GUIDE, TEMPLATE_IN_GUIDE);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(REAL_TEMPLATE, target);
  return target;
}

describe('cf validate design', () => {
  let tmpRoot: string;
  let projectRoot: string;
  let worktreeRoot: string;
  let originalCwd: string;
  let originalDataDir: string | undefined;
  let stdout: string;
  let logLines: string[];
  let errors: string[];

  beforeEach(() => {
    originalCwd = process.cwd();
    // Keep the developer's user-level config out of the gate setting.
    originalDataDir = process.env.CONTEXT_FORGE_DATA_DIR;
    // realpath: macOS cwd reports /private/var while mkdtemp returns /var.
    tmpRoot = realpathSync(mkdtempSync(join(tmpdir(), 'cf-validate-design-')));
    projectRoot = join(tmpRoot, 'main-checkout');
    worktreeRoot = join(tmpRoot, 'wt-alpha');
    process.env.CONTEXT_FORGE_DATA_DIR = join(tmpRoot, 'data');
    installTemplate(projectRoot);
    installTemplate(worktreeRoot);
    // A second worktree so the resolver can't pass by having only one choice.
    mkdirSync(join(tmpRoot, 'wt-beta'), { recursive: true });

    const project = {
      id: 'proj_design',
      name: 'design-test',
      template: 'default',
      projectPath: projectRoot,
      worktrees: [
        { id: 'wt_alpha', name: 'alpha', indexRange: [200, 299], worktreePath: worktreeRoot },
        { id: 'wt_beta', name: 'beta', indexRange: [300, 399], worktreePath: join(tmpRoot, 'wt-beta') },
      ],
    };
    mockGetAll.mockResolvedValue([project]);
    mockGetById.mockResolvedValue(project);
    process.chdir(projectRoot);

    stdout = '';
    logLines = [];
    errors = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logLines.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
      stdout += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => {
      errors.push(String(chunk));
      return true;
    });
    vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`cf exited ${code}`);
    }) as never);
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    if (originalDataDir === undefined) delete process.env.CONTEXT_FORGE_DATA_DIR;
    else process.env.CONTEXT_FORGE_DATA_DIR = originalDataDir;
    vi.restoreAllMocks();
    process.exitCode = undefined;
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  async function run(...args: string[]): Promise<void> {
    const program = new Command();
    program.exitOverride();
    registerValidateCommand(program);
    await program.parseAsync(['node', 'cf', 'validate', 'design', ...args]);
  }

  function writeTmp(name: string, content: string): string {
    const filePath = join(tmpRoot, name);
    writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  const design214 = (): string => readFileSync(DESIGN_214, 'utf-8');
  const brokenCopy = (): string =>
    writeTmp('broken.md', design214().replace(/^## Value\n[\s\S]*?(?=^## Technical Scope$)/m, ''));
  const noDocTypeCopy = (): string =>
    writeTmp('nodoc.md', design214().replace(/^docType:.*\n/m, ''));

  it('passes real slice designs', async () => {
    await run(...PASSING_DESIGNS);
    expect(logLines).toEqual(PASSING_DESIGNS.map((f) => `PASS ${f}`));
    expect(process.exitCode).toBeUndefined();
  });

  it('names each missing heading and exits 1', async () => {
    const broken = brokenCopy();
    await run(broken);
    expect(logLines).toEqual([`FAIL ${broken}`, '  missing: ## Value']);
    expect(process.exitCode).toBe(1);
  });

  it('prints the frontmatter message when docType is absent', async () => {
    const noDoc = noDocTypeCopy();
    await run(noDoc);
    expect(logLines).toEqual([
      `FAIL ${noDoc}`,
      "  frontmatter must declare 'docType: slice-design' (see file-naming-conventions.md)",
    ]);
    expect(process.exitCode).toBe(1);
  });

  it('prints every result in order when one file fails', async () => {
    const broken = brokenCopy();
    await run(DESIGN_214, broken, PASSING_DESIGNS[0]);
    expect(logLines).toEqual([
      `PASS ${DESIGN_214}`,
      `FAIL ${broken}`,
      '  missing: ## Value',
      `PASS ${PASSING_DESIGNS[0]}`,
    ]);
    expect(process.exitCode).toBe(1);
  });

  it('emits the JSON contract for a pass/fail mix', async () => {
    const broken = brokenCopy();
    const noDoc = noDocTypeCopy();
    await run('--json', DESIGN_214, broken, noDoc);
    expect(JSON.parse(stdout)).toEqual({
      template: join(projectRoot, GUIDE, TEMPLATE_IN_GUIDE),
      decisionGateEnabled: true,
      passed: 1,
      failed: 2,
      files: [
        { path: DESIGN_214, pass: true, missing: [], pending: [] },
        { path: broken, pass: false, missing: ['## Value'], pending: [] },
        { path: noDoc, pass: false, missing: [], pending: [], reason: 'doctype' },
      ],
    });
    expect(process.exitCode).toBe(1);
  });

  describe('pending decisions', () => {
    const withStatus = (status: string): string =>
      writeTmp('pending.md', `${design214()}\n### D99 — Open question\nStatus: ${status}\n`);
    const pendingLine = (): number => design214().split('\n').length + 2;

    it('prints the pending decision and exits 1', async () => {
      const file = withStatus('pending-pm');
      await run(file);
      expect(logLines).toEqual([
        `FAIL ${file}`,
        `  pending-pm: D99 — Open question (line ${pendingLine()})`,
      ]);
      expect(process.exitCode).toBe(1);
    });

    it('passes once the decision is decided', async () => {
      const file = withStatus('decided');
      await run(file);
      expect(logLines).toEqual([`PASS ${file}`]);
      expect(process.exitCode).toBeUndefined();
    });

    it('--json carries files[].pending and decisionGateEnabled', async () => {
      const file = withStatus('pending-pm');
      await run('--json', file);
      const output = JSON.parse(stdout);
      expect(output.decisionGateEnabled).toBe(true);
      expect(output.files[0].pending).toEqual([
        { heading: 'D99 — Open question', line: pendingLine() },
      ]);
    });

    it('passes and reports the gate off when workflow.decision_gate_enabled is false', async () => {
      await new ConfigManager(projectRoot).set('workflow.decision_gate_enabled', false, 'project');
      const file = withStatus('pending-pm');
      await run('--json', file);
      const output = JSON.parse(stdout);
      expect(output.decisionGateEnabled).toBe(false);
      expect(output.files[0]).toMatchObject({ pass: true, pending: [] });
      expect(process.exitCode).toBeUndefined();
    });
  });

  describe('exit 2 with empty stdout', () => {
    const cases: Array<[string, () => string[]]> = [
      ['no arguments', () => []],
      ['a nonexistent path', () => [join(tmpRoot, 'nope.md')]],
      ['a valid file before a missing one', () => [DESIGN_214, join(tmpRoot, 'nope.md')]],
    ];

    for (const json of [false, true]) {
      for (const [label, args] of cases) {
        it(`${label}${json ? ' (--json)' : ''}`, async () => {
          const argv = json ? ['--json', ...args()] : args();
          await expect(run(...argv)).rejects.toThrow('cf exited 2');
          expect(stdout).toBe('');
          expect(logLines).toEqual([]);
        });
      }
    }

    it('missing template names cf guides update', async () => {
      rmSync(join(projectRoot, GUIDE), { recursive: true, force: true });
      await expect(run(DESIGN_214)).rejects.toThrow('cf exited 2');
      expect(stdout).toBe('');
      expect(logLines).toEqual([]);
      expect(errors.join('\n')).toContain('cf guides update');
    });
  });

  it("reads the template from the invoking worktree's guide", async () => {
    process.chdir(worktreeRoot);
    await run('--json', DESIGN_214);
    expect(JSON.parse(stdout).template).toBe(join(worktreeRoot, GUIDE, TEMPLATE_IN_GUIDE));
  });
});
