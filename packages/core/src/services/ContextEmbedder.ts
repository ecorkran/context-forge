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

  // Append CLAUDE.md if present — project conventions required for design/task phases
  const claudeMdPath = join(projectPath, 'CLAUDE.md');
  try {
    const claudeContent = await readFile(claudeMdPath, 'utf-8');
    blocks.push(fencedBlock('CLAUDE.md', claudeContent));
  } catch {
    // CLAUDE.md is optional — no warning if absent
  }

  if (blocks.length === 0 && warnings.length === 0) return contextString;

  const separator = '\n\n---\n\n# Referenced Files\n\n';
  const warningSection = warnings.length > 0
    ? warnings.map((w) => `> ${w}`).join('\n') + '\n\n'
    : '';

  return contextString + separator + warningSection + blocks.join('\n\n');
}
