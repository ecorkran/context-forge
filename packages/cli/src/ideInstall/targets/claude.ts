/**
 * The claude target (`setup_claude`): alwaysApply rules into CLAUDE.md's
 * managed block, scoped rules to .claude/rules/, agents and skills copied.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { InstallAbort, requireRulesDir, type InstallContext } from '../context.js';
import { isDirectory, listMarkdownFiles } from '../fsChecks.js';
import { hasAlwaysApply, stripNameField } from '../frontmatter.js';
import { excludedMessage } from '../exclusions.js';
import { compileClaudeRules } from '../rules.js';
import { copyFiles, copySkills } from './copy.js';

/** `copy_claude_modular_rules`: scoped rules to .claude/rules/, name: stripped. */
function copyClaudeModularRules(ctx: InstallContext, targetDir: string): void {
  fs.mkdirSync(targetDir, { recursive: true });
  let copied = 0;
  for (const file of listMarkdownFiles(ctx.guide.rules)) {
    const text = fs.readFileSync(file, 'utf-8');
    if (hasAlwaysApply(text)) continue;
    const filename = path.basename(file);
    if (ctx.exclusions.isExcluded(filename)) {
      ctx.out.status('yellow', excludedMessage(filename));
      continue;
    }
    const content = Buffer.from(stripNameField(text));
    if (!ctx.manifest.installFile(content, path.join(targetDir, filename))) continue;
    ctx.out.status('green', `✅ Copied ${filename} → .claude/rules/${filename}`);
    copied++;
  }
  ctx.out.status('blue', `📋 Copied ${copied} modular rules to .claude/rules/`);
}

export function setupClaude(ctx: InstallContext): void {
  const { out, guide, targetRoot } = ctx;
  out.status('blue', '🚀 Setting up Claude Code rules...');
  out.line();
  requireRulesDir(ctx);

  if (!compileClaudeRules(guide.rules, path.join(targetRoot, 'CLAUDE.md'), out)) {
    out.status('red', '❌ Failed to compile CLAUDE.md');
    throw new InstallAbort('CLAUDE.md could not be compiled');
  }
  out.line();

  out.status('blue', '📄 Copying modular rules...');
  copyClaudeModularRules(ctx, path.join(targetRoot, '.claude', 'rules'));
  out.line();

  const hasAgents = isDirectory(guide.agents);
  if (hasAgents) {
    const agentsDir = path.join(targetRoot, '.claude', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    out.status('green', `📁 Created directory: ${agentsDir}`);
    out.status('blue', '🤖 Copying agent files...');
    copyFiles(ctx, guide.agents, agentsDir, 'agent');
    out.line();
  }

  const hasSkills = isDirectory(guide.skills);
  if (hasSkills) {
    const skillsDir = path.join(targetRoot, '.claude', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });
    out.status('blue', '⚡ Copying skill files...');
    copySkills(ctx, guide.skills, skillsDir);
    out.line();
  }

  out.status('green', '✅ Setup complete for Claude Code!');
  out.line();
  out.status('blue', '💡 Claude Code setup notes:');
  out.line('   • CLAUDE.md contains alwaysApply rules (general, git)');
  out.line('   • Modular rules copied to .claude/rules/');
  if (hasAgents) out.line('   • Agents copied to .claude/agents/');
  if (hasSkills) out.line('   • Skills copied to .claude/skills/');
}
