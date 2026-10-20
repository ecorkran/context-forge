// Single source for the onboarding recipe. Three agent surfaces (Claude Code command,
// Codex/agents skill, MCP tool) render from the steps below; everything that differs
// between surfaces lives in ONBOARD_SURFACES. Slice 260, D1-D3.

export type OnboardSurface = 'claude-command' | 'agent-skill' | 'mcp-tool';

export interface OnboardSurfaceProfile {
  /** Full frontmatter block including both `---` fences, or '' for none. */
  frontmatter: string;
  /** True for files committed to the repo: a do-not-edit comment follows the frontmatter. */
  generatedNotice: boolean;
  /** Markdown title line, or '' for none. */
  heading: string;
  /** Step 1: how to look for a registered project on this surface. */
  registrationCheck: string;
  /** Step 2: the clause naming where a provided project name comes from. */
  nameProvided: string;
  /** Step 2: how to run `cf init` on this surface. */
  setupRun: string;
  /** Step 2: what to do when `cf init` cannot be run (ends with the no-`git init` note). */
  setupFallback: string;
  /** Step 3: how to run the build on this surface. */
  buildHandoff: string;
  /** Step 3: how this surface refers to the "what next" command. */
  nextHint: string;
  /** Closing note on tool failure, or '' for none. */
  failureNote: string;
}

/** Placed directly after the frontmatter of committed assets (D2). */
export const GENERATED_NOTICE =
  '<!-- Generated from @context-forge/core onboardRecipe.ts. Edit the source, then run: pnpm --filter @context-forge/cli render:onboard -->';

const CLAUDE_FRONTMATTER = `---
description: Guide a user through Context Forge project setup and into their first phase of work
argument-hint: [project-name]
allowed-tools: Bash(cf:*), mcp__context-forge__project_list, mcp__context-forge__project_create, mcp__context-forge__project_get, mcp__context-forge__guide_status, mcp__context-forge__guide_install, mcp__context-forge__context_build, mcp__context-forge__workflow_next
---`;

const SKILL_FRONTMATTER = `---
name: cf-onboard
description: Guide a user through Context Forge project setup and into their first phase of work. Use when the user wants to set up or onboard a project with Context Forge.
---`;

const NO_GIT_INIT_NOTE =
  'Note: the MCP fallback cannot initialize git. If the directory is not a git\nrepository, inform the user they need to run `git init` first.';

const MCP_FALLBACK_STEPS =
  '1. Call `project_create` with `name` and `projectPath` (the CWD).\n2. Call `guide_install` to install the AI Project Guide.';

export const ONBOARD_SURFACES: Record<OnboardSurface, OnboardSurfaceProfile> = {
  'claude-command': {
    frontmatter: CLAUDE_FRONTMATTER,
    generatedNotice: true,
    heading: '',
    registrationCheck:
      '**MCP:** Call `project_list`. Scan results for a project whose `projectPath`\nmatches the current directory.\n**CLI:** Run `cf project list` and check the output.',
    nameProvided: 'If a project name argument\nwas provided with the command, use that.',
    setupRun: '**Primary:** Run `cf init <name>` via the shell.',
    setupFallback: `**MCP fallback** (if shell access is unavailable):\n${MCP_FALLBACK_STEPS}\n${NO_GIT_INIT_NOTE}`,
    buildHandoff: '**MCP:** Call `context_build`.\n**CLI:** Run `cf build`.',
    nextHint: '`cf next` (or `/cf:next`)',
    failureNote: 'If any MCP tool call fails, fall back to the CLI equivalent.',
  },
  'agent-skill': {
    frontmatter: SKILL_FRONTMATTER,
    generatedNotice: true,
    heading: '# Context Forge Onboard',
    registrationCheck:
      'Run `cf project list` and check the output.',
    nameProvided: 'If they provided a name\nwith the request, use that.',
    setupRun: 'Run `cf init <name>`.',
    setupFallback: `If the Context Forge MCP server is configured and shell access is\nunavailable, fall back to its tools:\n${MCP_FALLBACK_STEPS}\n${NO_GIT_INIT_NOTE}`,
    buildHandoff: 'Run `cf build`.',
    nextHint: '`cf next` (or the `cf-next` skill)',
    failureNote: 'If an MCP tool call fails, fall back to the CLI equivalent.',
  },
  'mcp-tool': {
    frontmatter: '',
    generatedNotice: false,
    heading: '# Context Forge Onboarding',
    registrationCheck:
      'Call `project_list`. Scan results for a project whose `projectPath` matches\nthe current directory.',
    nameProvided: 'If a project name argument\nwas provided, use that.',
    setupRun: 'Run `cf init <name>` via the shell.',
    setupFallback: `If shell access is unavailable, fall back to the MCP path:\n${MCP_FALLBACK_STEPS}\n${NO_GIT_INIT_NOTE}`,
    buildHandoff: 'Call `context_build`.',
    nextHint: '`workflow_next` (or `cf next` on the CLI)',
    failureNote: '',
  },
};

function renderBody(profile: OnboardSurfaceProfile): string[] {
  const blocks = [
    'You are guiding a user through Context Forge project onboarding. Follow these\nsteps in order — skip any step whose precondition is already met.',
    `## Step 1 — Detect existing project\n\nCheck whether a Context Forge project is already registered at the current\nworking directory.\n\n${profile.registrationCheck}\n\n- If a project exists at this path → skip to Step 3.\n- If no project exists → continue to Step 2.`,
    // No example name here on purpose: an example would be used when the user gives none.
    `## Step 2 — Set up the project\n\nAsk the user what they'd like to name their project. ${profile.nameProvided}\nIf the user declines to choose, use the current directory name.\n\n${profile.setupRun} This single command handles\neverything: git initialization, project registration, guide installation,\ncommand installation, and IDE setup.\n\n**Important:** Do not rely on environment context (like "Is a git repository")\nto determine git status — \`cf init\` checks the actual directory and handles\ngit initialization itself.\n\n${profile.setupFallback}`,
    `## Step 3 — Hand off to the context prompt\n\nThe project is set up. Build the context prompt:\n\n${profile.buildHandoff}\n\nUse the returned prompt as your working context and follow it; it starts the\nconversation, so do not open with questions of your own.\n\nYou can run ${profile.nextHint} anytime to see what to do next. It adapts as\nyour project progresses.`,
  ];
  if (profile.failureNote) blocks.push(`## Notes\n\n- ${profile.failureNote}`);
  return blocks;
}

export function renderOnboardRecipe(surface: OnboardSurface): string {
  const profile = ONBOARD_SURFACES[surface];
  const blocks: string[] = [];
  // The notice sits on the line directly after the closing frontmatter fence.
  const head = [profile.frontmatter, profile.generatedNotice ? GENERATED_NOTICE : ''].filter(Boolean);
  if (head.length) blocks.push(head.join('\n'));
  if (profile.heading) blocks.push(profile.heading);
  blocks.push(...renderBody(profile));
  return `${blocks.join('\n\n')}\n`;
}
