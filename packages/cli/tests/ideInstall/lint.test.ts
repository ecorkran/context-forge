/**
 * Lint config checks: detection, report-only mode, and --write-lint. The check
 * runs after every target, so these use `agents`, which prints the least.
 * Written configs belong to the project: they are not in the manifest.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { missingRequirements } from '../../src/ideInstall/lint.js';
import {
  assertSnapshot,
  FIXTURE_GUIDE,
  makeProject,
  makeTmpDir,
  run,
  snapshot,
  writeFiles,
  type FileContent,
  type RunResult,
} from './harness.js';

const PYPROJECT_PLAIN = '[project]\nname = "demo"\n';
const PYPROJECT_WITH_RUFF = '[project]\nname = "demo"\n\n[tool.ruff]\nline-length = 100\n';
const RUFF_COMPLETE = '[lint]\nselect = ["E", "F", "W", "I", "UP", "BLE", "ASYNC", "B"]\n';
const PYTHON_BASELINE = fs.readFileSync(path.join(FIXTURE_GUIDE, 'lint/python/ruff.toml'), 'utf-8');

let tmp: string;
beforeEach(() => {
  tmp = makeTmpDir();
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** Arrange a project, run agents once per flag set. */
function lintRun(files: Record<string, FileContent>, ...flagSets: string[][]): { project: string; runs: RunResult[] } {
  const { project, guide } = makeProject(tmp);
  writeFiles(project, files);
  return { project, runs: flagSets.map((flags) => run(guide, project, ['agents', ...flags])) };
}

const read = (project: string, rel: string): string => fs.readFileSync(path.join(project, rel), 'utf-8');
const exists = (project: string, rel: string): boolean => fs.existsSync(path.join(project, rel));

describe('lint', () => {
  it('test_lint_python_no_config_reports_only', async () => {
    const { project, runs } = lintRun({ 'pyproject.toml': PYPROJECT_PLAIN }, []);
    expect(exists(project, 'ruff.toml')).toBe(false);
    expect(runs[0].stdout).toContain('Lint (python)');
    await assertSnapshot('test_lint_python_report', snapshot(project, runs));
  });

  it('test_lint_python_write_lint_writes_baseline', async () => {
    const { project, runs } = lintRun({ 'pyproject.toml': PYPROJECT_PLAIN }, ['--write-lint']);
    expect(read(project, 'ruff.toml')).toBe(PYTHON_BASELINE);
    await assertSnapshot('test_lint_python_write', snapshot(project, runs));
  });

  it('test_lint_python_weak_pyproject_gets_extending_ruff_toml', async () => {
    const { project, runs } = lintRun({ 'pyproject.toml': PYPROJECT_WITH_RUFF }, [], ['--write-lint']);
    const ruffToml = read(project, 'ruff.toml');
    expect(ruffToml).toContain('extend = "pyproject.toml"');
    expect(ruffToml).toContain('extend-select');
    expect(read(project, 'pyproject.toml')).toBe(PYPROJECT_WITH_RUFF);
    await assertSnapshot('test_lint_python_extend', snapshot(project, runs));
  });

  it('test_lint_python_complete_config_no_report', async () => {
    const { project, runs } = lintRun({ 'pyproject.toml': PYPROJECT_PLAIN, 'ruff.toml': RUFF_COMPLETE }, ['--write-lint']);
    expect(runs[0].stdout).not.toContain('missing required rules');
    expect(read(project, 'ruff.toml')).toBe(RUFF_COMPLETE);
    await assertSnapshot('test_lint_python_complete', snapshot(project, runs));
  });

  it.each([
    ['dart', 'pubspec.yaml', 'analysis_options.yaml'],
    ['typescript', 'tsconfig.json', 'eslint.config.mjs'],
  ])('test_lint_report_then_write[%s]', async (language, markerFile, written) => {
    const { project, runs } = lintRun({ [markerFile]: '{}\n' }, [], ['--write-lint']);
    expect(runs[0].stdout).toContain(`Lint (${language})`);
    expect(exists(project, written)).toBe(true);
    await assertSnapshot(`test_lint_${language}`, snapshot(project, runs));
  });

  it.each([
    [3, true],
    [4, false],
  ])('test_lint_csharp_project_depth[depth%i]', async (depth, detected) => {
    const levels = Array.from({ length: depth - 1 }, () => 'sub').join('/');
    const { project, runs } = lintRun({ [`${levels}/App.csproj`]: '<Project />\n' }, ['--write-lint']);
    expect(runs[0].stdout.includes('Lint (csharp)')).toBe(detected);
    expect(exists(project, 'Directory.Build.props')).toBe(detected);
    await assertSnapshot(`test_lint_csharp_depth${depth}`, snapshot(project, runs));
  });
});

describe('missingRequirements', () => {
  const required = (text: string): string => {
    const file = path.join(tmp, 'required');
    fs.writeFileSync(file, text);
    return file;
  };

  it('reports the first alternative of each unmatched line, skipping blanks and comments', () => {
    const file = required('# comment\n\n"E"|"ALL"\n"B"|extend-select\n');
    expect(missingRequirements(file, 'select = ["ALL"]\n')).toBe('"B"');
  });

  it('ignores a final requirement line without a newline, as `while read` did', () => {
    expect(missingRequirements(required('"E"\n"B"'), '')).toBe('"E"');
  });

  it('matches nothing against empty config text', () => {
    expect(missingRequirements(required('|x\n'), '')).toBe('');
    expect(missingRequirements(required('|x\n'), '\n\n')).toBe('');
  });
});
