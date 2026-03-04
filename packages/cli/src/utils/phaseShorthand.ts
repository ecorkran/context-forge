import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PROMPT_FILE_RELATIVE_PATH } from '@context-forge/core';

/**
 * Phase shorthand map: P1 → phase name, derived at runtime from the prompt asset.
 * Cached after first parse.
 */
let cachedShorthands: Map<string, string> | null = null;

/**
 * Parse phase shorthands from the system prompt file.
 *
 * Extracts headings matching `(Phase n)` or `(Phase n.m)` and builds
 * a map: { P1: 'Concept', P2: 'Architecture', ... }
 *
 * The prompt file is resolved from the project path.
 */
export async function getPhaseShorthands(projectPath: string): Promise<Map<string, string>> {
  if (cachedShorthands) return cachedShorthands;

  const promptFilePath = path.join(projectPath, PROMPT_FILE_RELATIVE_PATH);
  const content = await fs.readFile(promptFilePath, 'utf-8');

  const map = new Map<string, string>();
  // Match headings like "##### Concept (Phase 1)" or "##### Implementation (Phase 6)"
  const pattern = /^#{1,6}\s+(.+?)\s+\(Phase\s+(\d+(?:\.\d+)?)\)\s*$/gm;

  let match;
  while ((match = pattern.exec(content)) !== null) {
    const name = match[1]!.trim();
    const number = match[2]!;
    // Only use the integer part for shorthand (P1, P2, etc.)
    const intPart = number.split('.')[0]!;
    const shorthand = `P${intPart}`;
    // First match for each integer wins (e.g. P2 = Architecture, not P2.1)
    if (!map.has(shorthand)) {
      map.set(shorthand, name);
    }
  }

  cachedShorthands = map;
  return map;
}

/** Clear the cached shorthands (for testing). */
export function clearPhaseShorthandCache(): void {
  cachedShorthands = null;
}

/**
 * Resolve a phase input (name, shorthand, or key) to a prompt key suitable
 * for SystemPromptParser.getPromptForInstruction().
 *
 * Resolution order:
 * 1. Phase shorthand (P1–P7) → resolved name
 * 2. Otherwise: return as-is (case-insensitive matching handled by parser)
 *
 * Hyphens and spaces are interchangeable.
 */
export async function resolvePhaseInput(
  input: string,
  projectPath: string,
): Promise<string> {
  // Check if input is a shorthand like P1, p5, etc.
  const shorthandMatch = input.match(/^[Pp](\d+)$/);
  if (shorthandMatch) {
    const shorthands = await getPhaseShorthands(projectPath);
    const key = `P${shorthandMatch[1]}`;
    const name = shorthands.get(key);
    if (name) return name;
    // Fall through — return as-is and let the parser handle it
  }

  // Normalize: hyphens ↔ spaces
  return input.replace(/-/g, ' ');
}
