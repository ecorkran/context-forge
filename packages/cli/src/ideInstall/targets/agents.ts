/**
 * AGENTS.md, written by the agents target and also by copilot and cursor
 * (`emit_agents_md`), plus the agents target itself (`setup_agents`).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AGENT_SKILLS_DIR } from '../../commands/ideTargets.js';
import { InstallAbort, requireRulesDir, type InstallContext } from '../context.js';
import { isDirectory, listMarkdownFiles } from '../fsChecks.js';
import { getApplyTo, getFrontmatterField, hasAlwaysApply } from '../frontmatter.js';
import { relativeToRoot } from '../paths.js';
import { compileAlwaysOnRules } from '../rules.js';
import { copySkills } from './copy.js';

const AGENTS_FILE = 'AGENTS.md';
const AGENTS_H1 = 'Project Guidelines';

/**
 * Index of the scoped rules, listed by the path they already occupy. The
 * AGENTS.md format has no paths mechanism to scope rules back down, so they
 * are not inlined. Excluded rules are left out: they are not installed.
 */
function scopedRuleIndex(ctx: InstallContext): { text: string; count: number } {
  const rulesPath = relativeToRoot(ctx.targetRoot, ctx.guide.rules);
  let body = '';
  let count = 0;
  for (const file of listMarkdownFiles(ctx.guide.rules)) {
    const text = fs.readFileSync(file, 'utf-8');
    if (hasAlwaysApply(text)) continue;
    const filename = path.basename(file);
    if (ctx.exclusions.isExcluded(filename)) continue;

    const description = getFrontmatterField(text, 'description');
    body += `- \`${rulesPath}/${filename}\``;
    if (description !== '') body += ` — ${description}`;
    body += `\n  Applies to: \`${getApplyTo(text)}\`\n`;
    count++;
  }
  if (count === 0) return { text: '', count };
  const intro =
    '## Additional Rules\n\n' +
    'The rules above always apply. The following are scoped to specific\n' +
    'languages and tools and are deliberately not inlined here — read the\n' +
    'relevant file when working in that area:\n\n';
  return { text: intro + body, count };
}

/**
 * `emit_agents_md`. The scoped index only makes sense for a target with no
 * scoped-rule surface of its own; copilot and cursor pass false. A failed
 * compile ends the install, as the bash `set -e` exit did.
 */
export function emitAgentsMd(ctx: InstallContext, includeScopedIndex: boolean): void {
  // Built first: it is generated content, so it belongs inside the managed block.
  const index = includeScopedIndex ? scopedRuleIndex(ctx) : { text: '', count: 0 };
  const compiled = compileAlwaysOnRules({
    rulesDir: ctx.guide.rules,
    outFile: path.join(ctx.targetRoot, AGENTS_FILE),
    label: AGENTS_FILE,
    h1: AGENTS_H1,
    trailing: index.text,
    out: ctx.out,
  });
  if (!compiled) throw new InstallAbort(`${AGENTS_FILE} could not be compiled`);
  if (index.count > 0) ctx.out.status('green', `✅ Indexed ${index.count} scoped rules in AGENTS.md`);
}

/** Skills to .agents/skills/, shared by the agents and copilot targets. True when the guide has skills. */
export function copyAgentSkills(ctx: InstallContext): boolean {
  if (!isDirectory(ctx.guide.skills)) return false;
  const skillsDir = path.join(ctx.targetRoot, AGENT_SKILLS_DIR);
  fs.mkdirSync(skillsDir, { recursive: true });
  ctx.out.status('blue', '⚡ Copying skill files...');
  copySkills(ctx, ctx.guide.skills, skillsDir);
  ctx.out.line();
  return true;
}

export function setupAgents(ctx: InstallContext): void {
  const { out } = ctx;
  out.status('blue', '🚀 Setting up AGENTS.md...');
  out.line();
  requireRulesDir(ctx);

  // The agents target writes no scoped-rule files, so the index is the only
  // place those rules are discoverable.
  emitAgentsMd(ctx, true);
  out.line();
  const hasSkills = copyAgentSkills(ctx);

  out.status('green', '✅ Setup complete for AGENTS.md!');
  out.line();
  out.status('blue', '💡 AGENTS.md setup notes:');
  out.line('   • AGENTS.md contains always-on rules, read by Codex and other AGENTS.md tools');
  out.line('   • Scoped language/tool rules are indexed by path, not inlined');
  out.line(hasSkills ? '   • Skills copied to .agents/skills/' : '   • No vendor-specific files were created');
}
