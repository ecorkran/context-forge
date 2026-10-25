/**
 * The copilot target (`setup_copilot`): always-on rules to
 * .github/copilot-instructions.md and AGENTS.md, scoped rules to
 * .github/instructions/*.instructions.md, skills to .agents/skills/.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GENERATED_MARKER } from '../../commands/ideTargets.js';
import { InstallAbort, requireRulesDir, type InstallContext } from '../context.js';
import { excludedMessage } from '../exclusions.js';
import { isDirectory, isEmptyDirectory, listMarkdownFiles } from '../fsChecks.js';
import { FENCE, getApplyTo, getFrontmatterField, hasAlwaysApply } from '../frontmatter.js';
import { fromRecords, toRecords } from '../lines.js';
import { compileAlwaysOnRules } from '../rules.js';
import { audienceSkipMessage, RULE_AUDIENCE } from '../ruleAudience.js';
import { copyAgentSkills, emitAgentsMd } from './agents.js';

const INSTRUCTIONS_LABEL = 'copilot-instructions.md';

/** The body after the frontmatter, with every `---` line dropped. */
function bodyAfterFrontmatter(text: string): string {
  const out: string[] = [];
  let inFrontmatter = false;
  let pastFrontmatter = false;
  for (const line of toRecords(text)) {
    if (line === FENCE) {
      if (!pastFrontmatter) {
        inFrontmatter = !inFrontmatter;
        if (!inFrontmatter) pastFrontmatter = true;
      }
      continue;
    }
    if (pastFrontmatter && !inFrontmatter) out.push(line);
  }
  return fromRecords(out);
}

/** A scoped rule as a Copilot instruction file: translated frontmatter, provenance stamp, body. */
function instructionFile(text: string, stem: string): { content: string; applyTo: string } {
  const name = getFrontmatterField(text, 'name') || stem;
  const description = getFrontmatterField(text, 'description');
  const applyTo = getApplyTo(text);
  let content = `---\nname: ${name}\n`;
  if (description !== '') content += `description: ${description}\n`;
  content += `applyTo: "${applyTo}"\n---\n${GENERATED_MARKER}\n\n`;
  return { content: content + bodyAfterFrontmatter(text), applyTo };
}

/** `emit_copilot_instruction_files`: scoped rules to .github/instructions/. */
function emitCopilotInstructionFiles(ctx: InstallContext): void {
  const targetDir = path.join(ctx.targetRoot, '.github', 'instructions');
  fs.mkdirSync(targetDir, { recursive: true });
  let copied = 0;
  for (const file of listMarkdownFiles(ctx.guide.rules)) {
    const text = fs.readFileSync(file, 'utf-8');
    if (hasAlwaysApply(text)) continue; // goes to copilot-instructions.md
    const filename = path.basename(file);
    if (ctx.exclusions.isExcluded(filename)) {
      ctx.out.status('yellow', excludedMessage(filename));
      continue;
    }
    const audienceSkip = audienceSkipMessage(text, filename, RULE_AUDIENCE.Copilot);
    if (audienceSkip !== null) {
      ctx.out.status('yellow', audienceSkip);
      continue;
    }
    const stem = path.basename(file, '.md');
    const { content, applyTo } = instructionFile(text, stem);
    const dest = path.join(targetDir, `${stem}.instructions.md`);
    if (!ctx.manifest.installFile(Buffer.from(content), dest)) continue;
    ctx.out.status(
      'green',
      `✅ ${filename} → .github/instructions/${stem}.instructions.md (applyTo: ${applyTo})`,
    );
    copied++;
  }
  ctx.out.status('blue', `📋 Emitted ${copied} scoped rule files to .github/instructions/`);
}

/**
 * Removes .github/prompts/*.prompt.md files earlier versions generated from
 * skills. Only files carrying GENERATED_MARKER are ours.
 */
function removeGeneratedPromptFiles(ctx: InstallContext): void {
  const promptsDir = path.join(ctx.targetRoot, '.github', 'prompts');
  if (!isDirectory(promptsDir)) return;
  let removed = 0;
  for (const file of listMarkdownFiles(promptsDir, '.prompt.md')) {
    if (!fs.readFileSync(file, 'utf-8').includes(GENERATED_MARKER)) continue;
    fs.rmSync(file);
    ctx.out.status('green', `🧹 Removed superseded prompt file: .github/prompts/${path.basename(file)}`);
    removed++;
  }
  if (removed > 0 && isEmptyDirectory(promptsDir)) fs.rmdirSync(promptsDir);
}

export function setupCopilot(ctx: InstallContext): void {
  const { out } = ctx;
  out.status('blue', '🚀 Setting up VS Code Copilot rules...');
  out.line();
  requireRulesDir(ctx);

  const compiled = compileAlwaysOnRules({
    rulesDir: ctx.guide.rules,
    outFile: path.join(ctx.targetRoot, '.github', INSTRUCTIONS_LABEL),
    label: INSTRUCTIONS_LABEL,
    h1: '',
    trailing: ctx.resolutionsSection,
    audience: RULE_AUDIENCE.Copilot,
    out,
  });
  if (!compiled) throw new InstallAbort(`${INSTRUCTIONS_LABEL} could not be compiled`);
  out.line();

  // No scoped index: .github/instructions/ already carries applyTo.
  emitAgentsMd(ctx, false);
  out.line();

  out.status('blue', '📄 Emitting scoped instruction files...');
  emitCopilotInstructionFiles(ctx);
  out.line();

  const hasSkills = copyAgentSkills(ctx);
  removeGeneratedPromptFiles(ctx);

  out.status('green', '✅ Setup complete for VS Code Copilot!');
  out.line();
  out.status('blue', '💡 Copilot setup notes:');
  out.line('   • .github/copilot-instructions.md contains always-on rules (workspace-wide)');
  out.line('   • AGENTS.md mirrors copilot-instructions.md for cross-tool compatibility —');
  out.line("     enabling VS Code's experimental chat.useAgentsMdFile setting loads the");
  out.line('     same always-on rules twice');
  out.line('   • .github/instructions/ contains scoped rules (per-language/per-path)');
  if (hasSkills) out.line('   • Skills copied to .agents/skills/ (Agent Skills format)');
}
