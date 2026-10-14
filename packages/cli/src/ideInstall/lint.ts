/**
 * Lint config check, ported from the guide's `setup-ide-lint.sh`. For each
 * language detected in the project, checks that the linter config contains the
 * rules in `lint/<language>/required`. Reports only, unless writeLint: then a
 * missing config is written. An existing config is never edited; the one
 * layered case is ruff, where a ruff.toml extends pyproject.toml's [tool.ruff].
 *
 * Reads the project from projectRoot and writes to targetRoot, so a dry run
 * (targetRoot = sandbox) still checks the real project. Written configs belong
 * to the project: they are not in the manifest and never pruned.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { InstallAbort, type InstallContext } from './context.js';
import { isDirectory, isFile } from './fsChecks.js';
import { anyLineContains, anyLineMatches, fromRecords, stripTrailingNewlines, toReadLines, toRecords } from './lines.js';

const SPACE = '[ \\t\\n\\v\\f\\r]';
const LANGUAGES = ['python', 'dart', 'typescript', 'csharp'] as const;
type Language = (typeof LANGUAGES)[number];
/** The guide's composable block for an existing ESLint flat config. */
const REQUIRED_RULES_FILE = 'required-rules.mjs';
/** Flat configs are `eslint.config.*`; legacy `.eslintrc*` cannot import the block. */
const FLAT_CONFIG_PREFIX = 'eslint.config.';

function read(file: string): string {
  return fs.readFileSync(file, 'utf-8');
}

/** `[ -f "$root/<name>" ] && cat` for each name: concatenated raw text. */
function catExisting(root: string, names: readonly string[]): string {
  return names.map((name) => path.join(root, name)).filter(isFile).map(read).join('');
}

/** `IFS='|'` field splitting: a trailing `|` adds no empty field. */
function alternatives(line: string): string[] {
  const parts = line.split('|');
  if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

/**
 * `lint_missing_requirements`: the first alternative of each requirement with
 * no fixed-string match in text, one per line. A final requirement line with
 * no newline is ignored, as `while read` ignored it.
 */
export function missingRequirements(requiredFile: string, configText: string): string {
  const text = stripTrailingNewlines(configText);
  const missing: string[] = [];
  for (const line of toReadLines(read(requiredFile))) {
    if (line === '' || line.startsWith('#')) continue;
    if (!alternatives(line).some((alt) => anyLineContains(text, alt))) missing.push(line.split('|')[0]);
  }
  return missing.join('\n');
}

class LintCheck {
  constructor(private readonly ctx: InstallContext) {}

  private get root(): string {
    return this.ctx.projectRoot;
  }

  private source(...parts: string[]): string {
    return path.join(this.ctx.guide.lint, ...parts);
  }

  private report(lang: string, what: string, missing: string): void {
    if (missing === '') {
      this.ctx.out.status('green', `✅ Lint (${lang}): ${what} has the required rules`);
    } else {
      const list = missing.replaceAll('\n', ' ');
      this.ctx.out.status('yellow', `⚠️  Lint (${lang}): ${what} is missing required rules: ${list}`);
    }
  }

  /** Write a missing config when writeLint is set, otherwise say how to. */
  private writeOrSuggest(lang: string, rel: string, content: Buffer): void {
    if (this.ctx.writeLint) {
      fs.writeFileSync(path.join(this.ctx.targetRoot, rel), content);
      this.ctx.out.status('green', `✅ Lint (${lang}): wrote ${rel}`);
    } else {
      this.ctx.out.status('yellow', `⚠️  Lint (${lang}): no ${rel} — run setup-ide with --write-lint to add it`);
    }
  }

  /** The [tool.ruff…] sections of pyproject.toml, quotes normalized to ". */
  private pyprojectRuffSections(): string {
    const pyproject = path.join(this.root, 'pyproject.toml');
    if (!isFile(pyproject)) return '';
    const sectionStart = new RegExp(`^${SPACE}*\\[`);
    const ruffSection = new RegExp(`^${SPACE}*\\[+tool\\.ruff`);
    let inRuff = false;
    const kept = toRecords(read(pyproject)).filter((line) => {
      if (sectionStart.test(line)) inRuff = ruffSection.test(line);
      return inRuff;
    });
    return fromRecords(kept).replaceAll("'", '"');
  }

  python(): void {
    const required = this.source('python', 'required');
    const hasRequirements = fs.readdirSync(this.root).some((name) => /^requirements.*\.txt$/.test(name));
    if (!isFile(path.join(this.root, 'pyproject.toml')) && !isFile(path.join(this.root, 'setup.py')) && !hasRequirements) {
      return;
    }

    // Ruff's precedence: .ruff.toml, then ruff.toml, then pyproject.toml.
    const cfg = ['.ruff.toml', 'ruff.toml'].find((name) => isFile(path.join(this.root, name)));
    if (cfg !== undefined) {
      const raw = read(path.join(this.root, cfg));
      const extendsPyproject = anyLineMatches(raw, new RegExp(`^${SPACE}*extend${SPACE}*=${SPACE}*["']pyproject\\.toml`));
      const text = raw.replaceAll("'", '"') + (extendsPyproject ? this.pyprojectRuffSections() : '');
      this.report('python', cfg, missingRequirements(required, text));
      return;
    }

    const sections = stripTrailingNewlines(this.pyprojectRuffSections());
    if (sections === '') {
      this.writeOrSuggest('python', 'ruff.toml', fs.readFileSync(this.source('python', 'ruff.toml')));
      return;
    }
    const missing = missingRequirements(required, sections);
    const what = '[tool.ruff] in pyproject.toml';
    if (missing === '' || !this.ctx.writeLint) {
      this.report('python', what, missing);
      if (missing !== '') {
        this.ctx.out.status('yellow', '   Run setup-ide with --write-lint to add a ruff.toml that extends it with them');
      }
      return;
    }

    // ruff.toml outranks pyproject.toml, so it extends that config: the
    // project's own select and ignore stay in force.
    const extendSelect = missing.split('\n').join(',').replaceAll(',', ', ');
    const ruffToml =
      '# Adds the rules required by ai-project-guide rules/python.md on top of\n' +
      '# [tool.ruff] in pyproject.toml, which stays the main ruff config.\n' +
      'extend = "pyproject.toml"\n\n[lint]\n' +
      `extend-select = [${extendSelect}]\n`;
    fs.writeFileSync(path.join(this.ctx.targetRoot, 'ruff.toml'), ruffToml);
    this.ctx.out.status('green', '✅ Lint (python): wrote ruff.toml extending [tool.ruff] in pyproject.toml');
  }

  dart(): void {
    const pubspec = path.join(this.root, 'pubspec.yaml');
    if (!isFile(pubspec)) return;
    const lang = anyLineMatches(read(pubspec), new RegExp(`sdk:${SPACE}*flutter`)) ? 'flutter' : 'dart';

    const existing = path.join(this.root, 'analysis_options.yaml');
    if (isFile(existing)) {
      this.report(lang, 'analysis_options.yaml', missingRequirements(this.source('dart', 'required'), read(existing)));
      return;
    }
    const baseline = fs.readFileSync(this.source('dart', 'analysis_options.yaml'));
    const content =
      lang === 'flutter'
        ? Buffer.from(
            fromRecords(
              toRecords(baseline.toString('utf-8')).map((line) =>
                line === 'include: package:lints/recommended.yaml' ? 'include: package:flutter_lints/flutter.yaml' : line,
              ),
            ),
          )
        : baseline;
    this.writeOrSuggest(lang, 'analysis_options.yaml', content);
  }

  typescript(): void {
    if (!isFile(path.join(this.root, 'tsconfig.json')) && !isFile(path.join(this.root, 'tsconfig.base.json'))) return;
    const candidates = [
      'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts',
      'eslint.config.mts', 'eslint.config.cts', '.eslintrc', '.eslintrc.js', '.eslintrc.cjs',
      '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml',
    ];
    const cfg = candidates.find((name) => isFile(path.join(this.root, name)));
    if (cfg !== undefined) {
      const text = read(path.join(this.root, cfg));
      const missing = missingRequirements(this.source('typescript', 'required'), text);
      this.report('typescript', cfg, missing);
      if (missing !== '' && cfg.startsWith(FLAT_CONFIG_PREFIX)) this.offerRequiredRules(cfg);
      return;
    }
    this.writeOrSuggest('typescript', 'eslint.config.mjs', fs.readFileSync(this.source('typescript', 'eslint.config.mjs')));
    if (this.ctx.writeLint) {
      this.ctx.out.status('blue', '   Install: npm i -D eslint @eslint/js typescript-eslint, and add a "lint": "eslint ." script');
    }
  }

  /**
   * A weak flat config is never edited. Instead: the two lines that add the
   * guide's required-rules block, and with writeLint, the block itself so the
   * import resolves. A project's own copy of the block is left alone.
   */
  private offerRequiredRules(cfg: string): void {
    const { out } = this.ctx;
    const block = this.source('typescript', REQUIRED_RULES_FILE);
    if (!isFile(block)) {
      out.status('yellow', `   This guide has no ${REQUIRED_RULES_FILE}; run cf guides update for the composable block`);
      return;
    }
    out.status('yellow', `   Add to ${cfg}: import requiredRules from "./${REQUIRED_RULES_FILE}";`);
    out.status('yellow', '   then ...requiredRules as the last entry of the exported config array');
    out.status('yellow', '   Expect new lint errors once these rules are on; they are real findings');
    if (isFile(path.join(this.root, REQUIRED_RULES_FILE))) return;
    if (this.ctx.writeLint) {
      fs.writeFileSync(path.join(this.ctx.targetRoot, REQUIRED_RULES_FILE), fs.readFileSync(block));
      out.status('green', `✅ Lint (typescript): wrote ${REQUIRED_RULES_FILE}`);
    } else {
      out.status('yellow', `   Run setup-ide with --write-lint to add ${REQUIRED_RULES_FILE}`);
    }
  }

  csharp(): void {
    const projects = findDotnetProjects(this.root);
    if (projects.length === 0) return;
    const settings = ['.editorconfig', 'Directory.Build.props'] as const;
    // The requirements span three kinds of file, so they are checked together.
    const text =
      catExisting(this.root, settings) +
      projects.filter((file) => file.endsWith('.csproj') && isFile(file)).map(read).join('');
    const missing = missingRequirements(this.source('csharp', 'required'), text);
    this.report('csharp', 'analyzer and build settings', missing);
    if (missing === '') return;
    for (const name of settings) {
      if (!isFile(path.join(this.root, name))) this.writeOrSuggest('csharp', name, fs.readFileSync(this.source('csharp', name)));
    }
  }
}

/** Never searched by the C# detection, at any depth. */
const DOTNET_PRUNE = new Set(['.git', 'node_modules', 'project-documents', 'bin', 'obj']);
const DOTNET_MAX_DEPTH = 3;

/** `find root -maxdepth 3 (prune …) -o -name '*.csproj' -o -name '*.sln'`. */
function findDotnetProjects(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string, depth: number): void => {
    for (const name of fs.readdirSync(dir)) {
      if (DOTNET_PRUNE.has(name)) continue;
      const full = path.join(dir, name);
      if (name.endsWith('.csproj') || name.endsWith('.sln')) found.push(full);
      if (depth < DOTNET_MAX_DEPTH && fs.lstatSync(full).isDirectory()) walk(full, depth + 1);
    }
  };
  walk(root, 1);
  return found;
}

/**
 * `check_lint_configs`: every language check. A language whose `<lang>.md`
 * rule is excluded is skipped: the project opted out of those rules.
 */
export function checkLintConfigs(ctx: InstallContext): void {
  if (!isDirectory(ctx.guide.lint)) {
    ctx.out.status('red', `❌ Lint config directory not found: ${ctx.guide.lint}`);
    throw new InstallAbort('lint config directory not found');
  }
  const check = new LintCheck(ctx);
  const run: Record<Language, () => void> = {
    python: () => check.python(),
    dart: () => check.dart(),
    typescript: () => check.typescript(),
    csharp: () => check.csharp(),
  };
  for (const lang of LANGUAGES) {
    if (!ctx.exclusions.isExcluded(`${lang}.md`)) run[lang]();
  }
}
