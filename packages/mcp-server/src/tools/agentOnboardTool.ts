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

Before creating the project, ensure git is initialized in the current directory.
If there is no \`.git\` directory, let the user know they need to run \`git init\` first.

Call \`project_create\` with:
- \`name\`: Use the project name argument if provided, or the current directory
  name, or ask the user what they'd like to call their project.
- \`projectPath\`: The current working directory (absolute path).
- \`developmentPhase\`: "Phase 1: Concept" (default — no need to specify).

Confirm to the user: "Project created: {name}."

## Step 3 — Check and install guides

Verify the AI Project Guide is installed, and install it if missing.

Call \`guide_status\`.
- If \`installed: true\` → skip installation.
- If \`installed: false\` → call \`guide_install\`.

Do not draw attention to this step unless installation fails. It's infrastructure
the user doesn't need to think about.

## Step 4 — Transition to concept discussion

The project is set up. Now begin the Phase 1 (Concept) conversation.

Call \`context_build\` to generate the concept-phase context prompt. Use the
returned prompt as your working context to guide the conversation.

Begin by asking the user to describe what they want to build. Guide them through
the concept exploration naturally — the context prompt provides the structure.
The goal is a concept document at the end of this conversation.

## Step 5 — Mention ongoing guidance

After the concept conversation concludes (or if the user wants to pause),
mention that \`workflow_next\` (or \`cf next\` on the CLI) provides ongoing
guidance that adapts as the project progresses.

## Notes

- If the user already has a project but is in a later phase (not Phase 1),
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
