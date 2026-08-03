import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { resolveArtifactPath } from '../schema/resolveFileByIndex.js';
import type { ProjectData } from '../types/project.js';

/**
 * Artifact fields that map to resolvable file paths via resolveArtifactPath.
 * Order determines the order they appear in the embedded output.
 */
const EMBEDDABLE_FIELDS: Array<keyof ProjectData> = [
  'fileArch',
  'fileSlicePlan',
  'fileSlice',
  'fileTasks',
  'fileHLD',
  'fileSpec',
  'fileConcept',
];

interface EmbedResult {
  relPath: string;
  content: string;
  missing: boolean;
}

/**
 * Conventions files in read-priority order. First match wins — embedding every
 * match would duplicate near-identical always-on rules in a prompt whose entire
 * reason for existing is that the model cannot read files itself.
 *
 * Deliberately not merged with the CLI's TARGETS table (packages/cli/src/commands/
 * setup-ide.ts): that table is a write-ownership map keyed by IDE target; this is a
 * read-priority list with no concept of IDE targets. Coupling them would force core
 * to know about CLI target names just to answer "what are this project's conventions?"
 */
const CONVENTIONS_FILES = ['CLAUDE.md', 'AGENTS.md', '.github/copilot-instructions.md'];

async function resolveAndRead(
  field: keyof ProjectData,
  stem: string,
  projectPath: string,
): Promise<EmbedResult> {
  const relPath = resolveArtifactPath(field as string, stem);
  if (!relPath) {
    return { relPath: stem, content: '', missing: true };
  }
  const absPath = join(projectPath, relPath);
  try {
    const content = await readFile(absPath, 'utf-8');
    return { relPath, content, missing: false };
  } catch {
    return { relPath, content: '', missing: true };
  }
}

function fencedBlock(relPath: string, content: string): string {
  return `## Embedded: ${relPath}\n\`\`\`markdown\n${content.trimEnd()}\n\`\`\``;
}

/**
 * Embed referenced artifact files and CLAUDE.md into the context string.
 *
 * Each resolved file is appended as a labeled fenced markdown block.
 * Files that cannot be found emit a warning comment instead of silently
 * disappearing — the consumer needs to know the reference couldn't be resolved.
 *
 * @param project  ProjectData with artifact field stems (fileArch, fileSlice, etc.)
 * @param projectPath  Absolute path to the project root
 * @param contextString  The base context string produced by cf build
 * @returns The context string with embedded file contents appended
 */
export async function embedReferencedFiles(
  project: ProjectData,
  projectPath: string,
  contextString: string,
): Promise<string> {
  const blocks: string[] = [];
  const warnings: string[] = [];

  for (const field of EMBEDDABLE_FIELDS) {
    const stem = project[field];
    if (!stem || typeof stem !== 'string' || !stem.trim()) continue;

    const result = await resolveAndRead(field, stem, projectPath);
    if (result.missing) {
      warnings.push(`Warning: referenced file not found and could not be embedded: ${result.relPath}`);
    } else {
      blocks.push(fencedBlock(result.relPath, result.content));
    }
  }

  // Embed the project's conventions file — first match in CONVENTIONS_FILES wins
  let conventionsFound = false;
  for (const relPath of CONVENTIONS_FILES) {
    const absPath = join(projectPath, ...relPath.split('/'));
    try {
      const content = await readFile(absPath, 'utf-8');
      blocks.push(fencedBlock(relPath, content));
      conventionsFound = true;
      break;
    } catch {
      continue;
    }
  }
  if (!conventionsFound) {
    warnings.push(
      `Warning: no conventions file found (looked for: ${CONVENTIONS_FILES.join(', ')}) — the embedded context has no project conventions`,
    );
  }

  if (blocks.length === 0 && warnings.length === 0) return contextString;

  const separator = '\n\n---\n\n# Referenced Files\n\n';
  const warningSection = warnings.length > 0
    ? warnings.map((w) => `> ${w}`).join('\n') + '\n\n'
    : '';

  return contextString + separator + warningSection + blocks.join('\n\n');
}
