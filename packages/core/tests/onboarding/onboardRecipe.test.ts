import { describe, it, expect } from 'vitest';
import {
  GENERATED_NOTICE,
  ONBOARD_SURFACES,
  renderOnboardRecipe,
  type OnboardSurface,
} from '../../src/onboarding/onboardRecipe.js';

const SURFACES = Object.keys(ONBOARD_SURFACES) as OnboardSurface[];

/** What each surface must contain: setup command, fallback tools, build handoff. */
const EXPECTED_COMMANDS: Record<OnboardSurface, string[]> = {
  'claude-command': ['cf project list', 'project_list', 'cf init', 'project_create', 'guide_install', 'cf build', 'context_build'],
  'agent-skill': ['cf project list', 'cf init', 'project_create', 'guide_install', 'cf build'],
  'mcp-tool': ['project_list', 'cf init', 'project_create', 'guide_install', 'context_build'],
};

describe('renderOnboardRecipe', () => {
  it.each(SURFACES)('%s has the registration check, setup and build handoff', (surface) => {
    const text = renderOnboardRecipe(surface);
    for (const expected of EXPECTED_COMMANDS[surface]) {
      expect(text).toContain(expected);
    }
  });

  it.each(SURFACES)('%s carries no concept opener, setup-ci text or later-phase note', (surface) => {
    const text = renderOnboardRecipe(surface).toLowerCase();
    expect(text).not.toContain('describe what you want to build');
    expect(text).not.toContain('setup-ci');
    expect(text).not.toContain('later phase');
  });

  it.each(SURFACES)('%s keeps the git-status warning and the no-git-init note', (surface) => {
    const text = renderOnboardRecipe(surface);
    expect(text).toContain('Do not rely on environment context');
    expect(text).toContain('cannot initialize git');
  });

  it.each(SURFACES)('%s passes the project name to cf init with --name (it takes no positional argument)', (surface) => {
    const text = renderOnboardRecipe(surface);
    expect(text).toContain('cf init --name <name>');
    expect(text).not.toContain('cf init <name>');
  });

  it('claude-command starts with frontmatter and lists allowed-tools', () => {
    const text = renderOnboardRecipe('claude-command');
    expect(text.startsWith('---\n')).toBe(true);
    expect(text).toContain('allowed-tools');
  });

  it('agent-skill is named cf-onboard', () => {
    expect(renderOnboardRecipe('agent-skill')).toContain('name: cf-onboard');
  });

  it('mcp-tool has no frontmatter and no generated comment', () => {
    const text = renderOnboardRecipe('mcp-tool');
    expect(text.startsWith('---')).toBe(false);
    expect(text).not.toContain(GENERATED_NOTICE);
  });

  it.each(['claude-command', 'agent-skill'] as const)(
    '%s carries the generated-file comment directly after the closing frontmatter',
    (surface) => {
      const frontmatter = ONBOARD_SURFACES[surface].frontmatter;
      expect(renderOnboardRecipe(surface).startsWith(`${frontmatter}\n${GENERATED_NOTICE}\n`)).toBe(true);
    }
  );
});
