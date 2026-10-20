import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderOnboardRecipe, type OnboardSurface } from '@context-forge/core';
import { getSourceCommandsDir } from '../src/commands/commandInstaller.js';

const REGENERATE_COMMAND = 'pnpm --filter @context-forge/cli render:onboard';

/** CLI surfaces and where their committed rendering lives (mirrors scripts/render-onboard.mjs). */
const CLI_ASSETS: ReadonlyArray<{ surface: OnboardSurface; path: string }> = [
  { surface: 'claude-command', path: join('cf', 'onboard.md') },
  { surface: 'agent-skill', path: join('codex', 'cf-onboard', 'SKILL.md') },
];

describe('onboarding assets match the core renderer', () => {
  it.each(CLI_ASSETS)('$path is byte-for-byte the $surface rendering', ({ surface, path }) => {
    const file = join(getSourceCommandsDir(), path);
    const committed = readFileSync(file, 'utf-8');
    expect(
      committed === renderOnboardRecipe(surface),
      `${file} has drifted from the core renderer. Edit onboardRecipe.ts, then run: ${REGENERATE_COMMAND}`
    ).toBe(true);
  });
});
