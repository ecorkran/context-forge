/**
 * The cursor target (`setup_cursor`): always-on rules to AGENTS.md, scoped
 * rules to .cursor/rules/*.mdc with paths converted to globs.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { requireRulesDir, type InstallContext } from '../context.js';
import { excludedMessage } from '../exclusions.js';
import { isDirectory, isFile, listMarkdownFiles } from '../fsChecks.js';
import { convertPathsToGlobs, frontmatterWarning, hasAlwaysApply } from '../frontmatter.js';
import { emitAgentsMd } from './agents.js';

const MDC = '.mdc';

function mdcName(file: string): string {
  return path.basename(file, '.md') + MDC;
}

/**
 * Removes .mdc files earlier runs wrote for rules that are now always-on (they
 * live in AGENTS.md). Only the exact stems of current always-on rules.
 */
function removeSupersededAlwaysOnMdc(ctx: InstallContext, rulesTargetDir: string): void {
  for (const file of listMarkdownFiles(ctx.guide.rules)) {
    if (!hasAlwaysApply(fs.readFileSync(file, 'utf-8'))) continue;
    const superseded = path.join(rulesTargetDir, mdcName(file));
    if (!isFile(superseded)) continue;
    fs.rmSync(superseded, { force: true });
    ctx.out.status('yellow', `🗑️  Removed superseded always-on rule: .cursor/rules/${mdcName(file)}`);
  }
}

/** `copy_cursor_rules`: scoped rules as .mdc, paths→globs, frontmatter validated. */
function copyCursorRules(ctx: InstallContext, targetDir: string): void {
  let copied = 0;
  let warnings = 0;
  for (const file of listMarkdownFiles(ctx.guide.rules)) {
    const text = fs.readFileSync(file, 'utf-8');
    if (hasAlwaysApply(text)) continue;
    const filename = path.basename(file);
    if (ctx.exclusions.isExcluded(filename)) {
      ctx.out.status('yellow', excludedMessage(filename));
      continue;
    }
    const targetFilename = mdcName(file);
    const targetPath = path.join(targetDir, targetFilename);
    if (!ctx.manifest.installFile(Buffer.from(convertPathsToGlobs(text)), targetPath)) continue;
    ctx.out.status('green', `✅ Converted ${filename} → ${targetFilename}`);

    const warning = frontmatterWarning(fs.readFileSync(targetPath, 'utf-8'), targetFilename);
    if (warning !== null) {
      ctx.out.status('yellow', warning);
      warnings++;
    }
    copied++;
  }
  ctx.out.status('blue', `📋 Converted ${copied} scoped rule files for Cursor`);
  if (warnings > 0) ctx.out.status('yellow', `⚠️  ${warnings} files have frontmatter issues`);
}

export function setupCursor(ctx: InstallContext): void {
  const { out } = ctx;
  const rulesTargetDir = path.join(ctx.targetRoot, '.cursor', 'rules');
  out.status('blue', '🚀 Setting up Cursor IDE rules...');
  out.line();
  requireRulesDir(ctx);

  fs.mkdirSync(rulesTargetDir, { recursive: true });
  out.status('green', `📁 Created directory: ${rulesTargetDir}`);

  // No scoped index: .cursor/rules/*.mdc carries its own scoping via globs.
  emitAgentsMd(ctx, false);
  out.line();

  removeSupersededAlwaysOnMdc(ctx, rulesTargetDir);
  out.status('blue', '📄 Converting and copying scoped rules files...');
  copyCursorRules(ctx, rulesTargetDir);
  out.line();

  // No longer written, and not deleted: the files carry no marker, so past
  // output cannot be told apart from user content.
  if (isDirectory(path.join(ctx.targetRoot, '.cursor', 'agents'))) {
    out.status('yellow', '⚠️  .cursor/agents/ is no longer managed by this script — remove it by hand if no longer needed');
  }

  out.status('green', '✅ Setup complete for Cursor!');
  out.line();
  out.status('blue', '💡 Cursor setup notes:');
  out.line('   • AGENTS.md contains always-on rules (no scoped index — .cursor/rules/ has its own)');
  out.line('   • Scoped rules converted to .cursor/rules/ as .mdc files (paths→globs)');
  out.line('   • Restart Cursor to ensure rules are loaded');
}
