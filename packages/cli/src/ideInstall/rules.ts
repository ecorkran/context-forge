/**
 * Compiling alwaysApply rules into the managed block of CLAUDE.md, AGENTS.md
 * and copilot-instructions.md. Two body extractors exist because the bash had
 * two that differ: claude keeps `---` lines after the frontmatter, the
 * always-on compiler drops every one, inside code fences too.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { isDirectory, listMarkdownFiles } from './fsChecks.js';
import { FENCE, hasAlwaysApply } from './frontmatter.js';
import { fromRecords, toRecords } from './lines.js';
import { writeManagedSection } from './managedSection.js';
import type { Printer } from './output.js';

const HEADING = /^#{1,6} /;
const SUBHEADING = /^#{2,6} /;
const CODE_FENCE = /^```/;

/** Title of the CLAUDE.md block. */
const CLAUDE_H1 = 'Project Guidelines for Claude';

/** `❌ Source directory not found: <dir>`, shared by every copier and compiler. */
export function sourceDirMissing(dir: string): string {
  return `❌ Source directory not found: ${dir}`;
}

/** The first `#{1,6} ` heading after the frontmatter, outside code fences. Empty if none. */
export function sectionTitle(text: string): string {
  let inFrontmatter = false;
  let pastFrontmatter = false;
  let inCode = false;
  for (const line of toRecords(text)) {
    if (line === FENCE && !pastFrontmatter) {
      inFrontmatter = !inFrontmatter;
      if (!inFrontmatter) pastFrontmatter = true;
      continue;
    }
    if (inFrontmatter) continue;
    if (CODE_FENCE.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    if (pastFrontmatter && HEADING.test(line)) return line.replace(HEADING, '');
  }
  return '';
}

export type FenceHandling = 'keep-after-frontmatter' | 'drop-all';

/**
 * A rule's body: frontmatter and first heading removed, `#{2,6} ` headings
 * outside code fences promoted one level. Code-fence lines print even before
 * the frontmatter.
 */
export function ruleBody(text: string, fences: FenceHandling): string {
  const out: string[] = [];
  let inFrontmatter = false;
  let pastFrontmatter = false;
  let pastHeading = false;
  let inCode = false;
  for (const line of toRecords(text)) {
    if (line === FENCE) {
      if (!pastFrontmatter) {
        inFrontmatter = !inFrontmatter;
        if (!inFrontmatter) pastFrontmatter = true;
        continue;
      }
      if (fences === 'drop-all') continue;
    }
    if (inFrontmatter) continue;
    if (CODE_FENCE.test(line)) inCode = !inCode;
    if (inCode) {
      out.push(line);
      continue;
    }
    if (pastFrontmatter && !pastHeading && HEADING.test(line)) {
      pastHeading = true;
      continue;
    }
    if (pastFrontmatter && pastHeading) out.push(SUBHEADING.test(line) ? line.slice(1) : line);
  }
  return fromRecords(out);
}

function stem(file: string): string {
  return path.basename(file, '.md');
}

/**
 * Claude's fallback section title when a rule has no heading: words
 * capitalized, `-` as spaces, then ` Rules`. The bash `sed 's/\b\w/\U&/g'` did
 * this on GNU sed only; BSD sed turned it into `s/bw/Ubw/g`. The intended
 * title is ported.
 */
export function claudeFallbackTitle(file: string): string {
  const words = stem(file).replace(/\b\w/g, (letter) => letter.toUpperCase());
  return `${words.replaceAll('-', ' ')} Rules`;
}

/** The always-on fallback title: `-` as spaces, no suffix. */
export function alwaysOnFallbackTitle(file: string): string {
  return stem(file).replaceAll('-', ' ');
}

function alwaysOnRules(rulesDir: string): { file: string; text: string }[] {
  return listMarkdownFiles(rulesDir)
    .map((file) => ({ file, text: fs.readFileSync(file, 'utf-8') }))
    .filter(({ text }) => hasAlwaysApply(text));
}

/** `compile_claude_rules`: alwaysApply rules into CLAUDE.md's block. False on failure. */
export function compileClaudeRules(rulesDir: string, targetFile: string, out: Printer): boolean {
  if (!isDirectory(rulesDir)) {
    out.status('red', sourceDirMissing(rulesDir));
    return false;
  }
  out.status('blue', '📄 Compiling alwaysApply rules into CLAUDE.md...');

  let content = `# ${CLAUDE_H1}\n\n`;
  const rules = alwaysOnRules(rulesDir);
  for (const { file, text } of rules) {
    const title = sectionTitle(text);
    content += `## ${title !== '' ? title : claudeFallbackTitle(file)}\n`;
    content += ruleBody(text, 'keep-after-frontmatter') + '\n';
    out.status('green', `✅ Embedded ${stem(file)} rules in CLAUDE.md`);
  }

  if (!writeManagedSection(targetFile, content, 'CLAUDE.md', out)) return false;
  out.status('blue', `📋 Embedded ${rules.length} alwaysApply rules in CLAUDE.md`);
  return true;
}

export interface AlwaysOnOptions {
  rulesDir: string;
  outFile: string;
  /** Artifact name used in messages and the managed-section label. */
  label: string;
  /** `# <h1>` opens the block when non-empty. */
  h1: string;
  /** Generated sections appended inside the block, after the rules. */
  trailing: string;
  out: Printer;
}

/**
 * `compile_always_on_rules`: alwaysApply rules into one always-on file
 * (copilot-instructions.md or AGENTS.md). False on failure.
 */
export function compileAlwaysOnRules(options: AlwaysOnOptions): boolean {
  const { rulesDir, outFile, label, h1, trailing, out } = options;
  if (!isDirectory(rulesDir)) {
    out.status('red', sourceDirMissing(rulesDir));
    return false;
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  let content = h1 !== '' ? `# ${h1}\n\n` : '';
  const rules = alwaysOnRules(rulesDir);
  for (const { file, text } of rules) {
    const title = sectionTitle(text);
    content += `## ${title !== '' ? title : alwaysOnFallbackTitle(file)}\n`;
    content += ruleBody(text, 'drop-all') + '\n';
    out.status('green', `✅ Embedded ${stem(file)} in ${label}`);
  }
  content += trailing;

  if (!writeManagedSection(outFile, content, label, out)) return false;
  out.status('blue', `📋 Compiled ${rules.length} alwaysApply rules → ${label}`);
  return true;
}
