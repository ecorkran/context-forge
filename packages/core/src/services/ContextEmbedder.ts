import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { toRootRelative } from '../adoption/adoptionInputs.js';
import { isEnoent } from '../detection/pathPresent.js';
import { DocsMapError, docsMapPath } from '../docs-map/index.js';
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
  const relPath = resolveArtifactPath(field, stem);
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

export interface EmbedOptions {
  /**
   * A comprehension doc longer than this is named, not inlined. It is generated and can be
   * large; the docs map is bounded by the repo's doc count, so it is always inlined.
   */
  comprehensionMaxChars: number;
}

/** Reads a file under the project root; undefined when it does not exist. Other errors propagate. */
async function readIfPresent(projectPath: string, relPath: string): Promise<string | undefined> {
  try {
    return await readFile(join(projectPath, ...relPath.split('/')), 'utf-8');
  } catch (error) {
    // A recorded path or an optional file that is absent is a reportable fact, not a failure.
    if (isEnoent(error)) return undefined;
    throw error;
  }
}

/** The comprehension doc (capped) and the docs map (always) for the build's codebase reference. */
async function embedCodebaseReference(
  project: ProjectData,
  projectPath: string,
  options: EmbedOptions,
  blocks: string[],
  warnings: string[],
): Promise<void> {
  const comprehensionPath = project.fileComprehension;
  if (comprehensionPath) {
    const content = await readIfPresent(projectPath, comprehensionPath);
    if (content === undefined) {
      warnings.push(`Warning: referenced file not found and could not be embedded: ${comprehensionPath}`);
    } else if (content.length > options.comprehensionMaxChars) {
      warnings.push(
        `Note: comprehension doc not embedded (${content.length} chars exceeds embed.comprehension_max_chars=${options.comprehensionMaxChars}); it lives at ${comprehensionPath}`,
      );
    } else {
      blocks.push(fencedBlock(comprehensionPath, content));
    }
  }

  let mapPath: string;
  try {
    mapPath = toRootRelative(projectPath, docsMapPath(projectPath, project.name));
  } catch (error) {
    if (!(error instanceof DocsMapError)) throw error;
    warnings.push(`Warning: docs map not embedded: ${error.reason}`);
    return;
  }
  const mapContent = await readIfPresent(projectPath, mapPath);
  if (mapContent !== undefined) blocks.push(fencedBlock(mapPath, mapContent));
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
 * @param options  Embed limits, read from cf config by the caller
 * @returns The context string with embedded file contents appended
 */
export async function embedReferencedFiles(
  project: ProjectData,
  projectPath: string,
  contextString: string,
  options: EmbedOptions,
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

  await embedCodebaseReference(project, projectPath, options, blocks, warnings);

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
