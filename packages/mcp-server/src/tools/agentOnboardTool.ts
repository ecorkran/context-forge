import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

const ONBOARD_GUIDE = `# Context Forge Onboarding

Follow these steps in order to set up a new Context Forge project and guide the
user into their first phase of work. Skip any step whose precondition is already met.

## Step 1 — Detect existing project

Check whether a Context Forge project is already registered at the current
working directory.

Call \`project_list\`. Scan results for a project whose \`projectPath\` matches
the current directory.

- If a project exists at this path → skip to Step 3.
- If no project exists → continue to Step 2.

## Step 2 — Create project

Ask the user what they'd like to name their project. If a project name argument
was provided, use that. If the user declines to choose, default to the current
directory name.

Run \`cf init <name>\` via the shell. This single command handles everything:
git initialization, project registration, guide installation, command
installation, and IDE setup.

**Important:** Do not rely on environment context (like "Is a git repository")
to determine git status — \`cf init\` checks the actual directory and handles
git initialization itself.

If shell access is unavailable, fall back to the MCP path:
1. Call \`project_create\` with \`name\` and \`projectPath\` (the CWD).
2. Call \`guide_install\` to install the AI Project Guide.
Note: the MCP fallback cannot initialize git. If the directory is not a git
repository, inform the user they need to run \`git init\` first.

## Step 3 — Transition to concept discussion

The project is set up. Now begin the Phase 0 (Concept) conversation.

Call \`context_build\` to generate the concept-phase context prompt. Use the
returned prompt as your working context to guide the conversation.

Begin by asking the user to describe what they want to build. Guide them through
the concept exploration naturally — the context prompt provides the structure.
The goal is a concept document at the end of this conversation.

## Step 4 — Mention ongoing guidance

After the concept conversation concludes (or if the user wants to pause),
mention that \`workflow_next\` (or \`cf next\` on the CLI) provides ongoing
guidance that adapts as the project progresses.

## Notes

- If the user already has a project but is in a later phase (not Phase 0),
  acknowledge this and call \`workflow_next\` instead of starting a concept
  discussion.
- Keep the conversation natural. This is onboarding, not a checklist.
  Adapt to what the user is telling you.
`;

export function registerAgentOnboardTool(server: McpServer): void {
  server.registerTool(
    'agent_onboard',
    {
      title: 'Onboard New Project',
      description:
        'Step-by-step instructions for setting up a new Context Forge project and guiding the user into their first phase of work. ' +
        'Returns an onboarding recipe the agent should follow. Optionally accepts a project name.',
      inputSchema: {
        projectName: z
          .string()
          .optional()
          .describe('Optional project name. If omitted, the agent should use the directory name or ask the user.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ projectName }) => {
      let text = ONBOARD_GUIDE;
      if (projectName) {
        text += `\n**Project name provided:** ${projectName}\n`;
      }
      return {
        content: [{ type: 'text' as const, text }],
      };
    },
  );
}
