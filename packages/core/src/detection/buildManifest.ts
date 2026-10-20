// Core's single "has a build manifest" fact. Slice 261 reuses this rather than
// defining its own; extend the list here only.
import { join } from 'path';
import { pathPresent } from './pathPresent.js';

export const BUILD_MANIFESTS: readonly string[] = [
  'package.json',
  'pyproject.toml',
  'setup.py',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'Gemfile',
  'composer.json',
];

/** True when projectPath itself holds any build manifest (no walk upward). */
export function hasBuildManifest(projectPath: string): boolean {
  return BUILD_MANIFESTS.some((name) => pathPresent(join(projectPath, name)));
}
