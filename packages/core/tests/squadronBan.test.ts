import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// D10: cf never names squadron's files and never runs `sq`. Squadron calls cf and passes paths in.
const FORBIDDEN_PATTERNS: readonly { name: string; pattern: RegExp }[] = [
  { name: 'squadron comprehension file name', pattern: /codebase-comprehension/ },
  { name: 'squadron probe command', pattern: /sq probe/ },
  { name: 'process invocation of sq', pattern: /(['"])sq\1/ },
];

const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['node_modules', 'dist', 'tests']);
const PACKAGES_DIR = fileURLToPath(new URL('../..', import.meta.url));
const REQUIRED_PACKAGES = ['core', 'cli', 'mcp-server'];

interface Violation {
  file: string;
  line: number;
  rule: string;
}

function findViolations(text: string): { line: number; rule: string }[] {
  const found: { line: number; rule: string }[] = [];
  text.split('\n').forEach((lineText, index) => {
    for (const { name, pattern } of FORBIDDEN_PATTERNS) {
      if (pattern.test(lineText)) found.push({ line: index + 1, rule: name });
    }
  });
  return found;
}

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) return SKIPPED_DIRECTORIES.has(entry.name) ? [] : listSourceFiles(full);
    return entry.isFile() && entry.name.endsWith('.ts') ? [full] : [];
  });
}

function packageSourceFiles(): Map<string, string[]> {
  const bySourcePackage = new Map<string, string[]>();
  for (const pkg of readdirSync(PACKAGES_DIR, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    const srcDir = join(PACKAGES_DIR, pkg.name, 'src');
    try {
      bySourcePackage.set(pkg.name, listSourceFiles(srcDir));
    } catch (error) {
      // A package without a src directory (e.g. the meta-package) has nothing to scan.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return bySourcePackage;
}

describe('squadron ban (D10)', () => {
  it('catches each forbidden pattern in an in-memory string', () => {
    const samples = [
      'const f = "user/analysis/944-analysis.codebase-comprehension.md";',
      '// then run sq probe on it',
      "execFile('sq', ['onboard']);",
      'spawn("sq", args);',
    ];
    for (const sample of samples) {
      expect(findViolations(sample), sample).not.toHaveLength(0);
    }
    expect(findViolations("const squad = 'squadron';")).toHaveLength(0);
  });

  it('finds source files in every required package', () => {
    const files = packageSourceFiles();
    for (const pkg of REQUIRED_PACKAGES) {
      expect(files.get(pkg)?.length ?? 0, `no source files scanned in packages/${pkg}`).toBeGreaterThan(0);
    }
  });

  it('has no cf source naming squadron files or running sq', () => {
    const violations: Violation[] = [];
    for (const files of packageSourceFiles().values()) {
      for (const file of files) {
        for (const { line, rule } of findViolations(readFileSync(file, 'utf-8'))) {
          violations.push({ file: relative(PACKAGES_DIR, file), line, rule });
        }
      }
    }
    const report = violations.map((v) => `${v.file}:${v.line} (${v.rule})`).join('\n');
    expect(violations, `squadron ban violations:\n${report}`).toHaveLength(0);
  });
});
