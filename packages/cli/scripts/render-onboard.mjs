// Writes the two committed onboarding assets from the single source in core.
// Run after `pnpm -r build`: pnpm --filter @context-forge/cli render:onboard
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderOnboardRecipe } from '@context-forge/core';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const ASSETS = [
  { surface: 'claude-command', path: 'commands/cf/onboard.md' },
  { surface: 'agent-skill', path: 'commands/codex/cf-onboard/SKILL.md' },
];

for (const { surface, path } of ASSETS) {
  const target = resolve(packageRoot, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, renderOnboardRecipe(surface));
  console.log(`wrote ${target}`);
}
