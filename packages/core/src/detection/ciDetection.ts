// CI recognition: does the project folder (or its repository root) carry a CI config?
// CI_SIGNATURES is the only place a signature is written; the scanner reads it.
import { readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { isEnoent, pathPresent } from './pathPresent.js';

export type CiSignature =
  | { kind: 'file'; path: string }
  // Directory scanned for *.yml / *.yaml entries (case-sensitive extension match).
  | { kind: 'dir'; path: string };

export const CI_SIGNATURES: readonly CiSignature[] = [
  { kind: 'dir', path: '.github/workflows' },
  { kind: 'file', path: '.gitlab-ci.yml' },
  { kind: 'file', path: '.circleci/config.yml' },
  { kind: 'file', path: 'azure-pipelines.yml' },
  { kind: 'file', path: 'bitbucket-pipelines.yml' },
  { kind: 'file', path: 'Jenkinsfile' },
  { kind: 'file', path: '.travis.yml' },
  { kind: 'dir', path: '.buildkite' },
];

const YAML_EXTENSIONS: readonly string[] = ['.yml', '.yaml'];

export interface CiRecognition {
  recognized: boolean;
  /** Absolute paths of every matched CI file, without duplicates. */
  matches: string[];
}

/**
 * Nearest ancestor of startDir (inclusive) holding a `.git` entry, file or
 * directory (worktrees use a file). Null when there is none. Does not spawn git.
 */
function findRepositoryRoot(startDir: string): string | null {
  let current = resolve(startDir);
  for (;;) {
    if (pathPresent(join(current, '.git'))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function listYamlFiles(dir: string): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch (error) {
    // ENOENT means the directory is not there: no matches. Anything else
    // (including ENOTDIR when the path is a file) is a real error.
    if (isEnoent(error)) return [];
    throw error;
  }
  return names
    .filter((name) => YAML_EXTENSIONS.some((ext) => name.endsWith(ext)))
    .map((name) => join(dir, name));
}

function scanDirectory(baseDir: string): string[] {
  const found: string[] = [];
  for (const signature of CI_SIGNATURES) {
    const target = join(baseDir, signature.path);
    if (signature.kind === 'file') {
      if (pathPresent(target)) found.push(target);
    } else {
      found.push(...listYamlFiles(target));
    }
  }
  return found;
}

export function recognizeCi(projectPath: string): CiRecognition {
  const projectDir = resolve(projectPath);
  const roots = [projectDir];
  const repoRoot = findRepositoryRoot(projectDir);
  if (repoRoot !== null && repoRoot !== projectDir) roots.push(repoRoot);

  const matches = [...new Set(roots.flatMap(scanDirectory))];
  return { recognized: matches.length > 0, matches };
}
