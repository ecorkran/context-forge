/**
 * Wholesale copies shared by the targets: flat files (`copy_files`) and skill
 * directories (`copy_skills`). Every write goes through the manifest's
 * ownership check.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { InstallAbort, type InstallContext } from '../context.js';
import { isDirectory, listMarkdownFiles } from '../fsChecks.js';
import { byteOrder } from '../lines.js';
import { relativeToRoot } from '../paths.js';
import { sourceDirMissing } from '../rules.js';

/** `copy_files`: every `*.md` in sourceDir into targetDir under the same name. */
export function copyFiles(ctx: InstallContext, sourceDir: string, targetDir: string, fileType: string): void {
  if (!isDirectory(sourceDir)) {
    ctx.out.status('red', sourceDirMissing(sourceDir));
    // bash returned 1 from a plain call, which `set -e` turned into exit 1.
    throw new InstallAbort(`source directory not found: ${sourceDir}`);
  }
  let copied = 0;
  for (const file of listMarkdownFiles(sourceDir)) {
    const name = path.basename(file);
    if (!ctx.manifest.installFile(fs.readFileSync(file), path.join(targetDir, name))) continue;
    ctx.out.status('green', `✅ Copied ${name} → ${name}`);
    copied++;
  }
  ctx.out.status('blue', `📋 Copied ${copied} ${fileType} files`);
}

/** Visible (non-dot) entries of a directory, in byte order. */
function visibleEntries(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((name) => !name.startsWith('.'))
    .sort(byteOrder);
}

/** `find dir -type f`: regular files (not symlinks), dotfiles included, as dir-relative paths. */
function regularFiles(dir: string, prefix = ''): string[] {
  const files: string[] = [];
  for (const name of fs.readdirSync(dir).sort(byteOrder)) {
    const full = path.join(dir, name);
    const stat = fs.lstatSync(full);
    if (stat.isFile()) files.push(prefix + name);
    else if (stat.isDirectory()) files.push(...regularFiles(full, `${prefix}${name}/`));
  }
  return files;
}

/** `copy_skills`: each `<name>/` directory under sourceDir, file by file. */
export function copySkills(ctx: InstallContext, sourceDir: string, targetDir: string): void {
  if (!isDirectory(sourceDir)) return;

  let copied = 0;
  for (const name of visibleEntries(sourceDir)) {
    const skillDir = path.join(sourceDir, name);
    if (!isDirectory(skillDir)) continue;
    if (visibleEntries(skillDir).length === 0) {
      ctx.out.status('yellow', `⚠️  Skipping empty skill directory: ${name}`);
      continue;
    }
    for (const rel of regularFiles(skillDir)) {
      const dest = path.join(targetDir, name, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      ctx.manifest.installFile(fs.readFileSync(path.join(skillDir, rel)), dest);
    }
    ctx.out.status('green', `✅ Copied skill: ${name}`);
    copied++;
  }

  // A skill must be a directory containing SKILL.md; a flat .md would vanish silently.
  for (const stray of listMarkdownFiles(sourceDir)) {
    ctx.out.status(
      'yellow',
      `⚠️  Not a skill: ${path.basename(stray)} — skills must be a directory containing SKILL.md`,
    );
  }

  if (copied > 0) {
    ctx.out.status('blue', `📋 Copied ${copied} skill(s) to ${relativeToRoot(ctx.targetRoot, targetDir)}/`);
  }
}
