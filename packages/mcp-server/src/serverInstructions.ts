/**
 * Cross-tool guidance returned to MCP clients in the `instructions` field.
 * Covers ordering, project resolution and recovery. Per-tool behavior belongs
 * in the tool descriptions, not here.
 */
export const SERVER_INSTRUCTIONS = [
  'Context Forge tracks AI-assisted project workflow: phases, slice plans, slice designs and task files.',
  'The `cf` CLI exposes the same operations; these tools exist so an agent does not have to shell out.',
  '',
  'Project resolution: tools that take a project id match the current working directory against registered project and worktree paths when the id is omitted.',
  '',
  'Ordering:',
  '- Start with workflow_status or workflow_next to learn where the project is and what to do next. Run workflow_check when artifacts look inconsistent.',
  '- Use introspection_* tools to read project artifacts rather than reading and parsing the files yourself.',
  '- Call project_schema before project_update if you are unsure which fields exist.',
  '',
  'Recovery:',
  '- If no registered project matches the directory, call project_detect with its absolute path to see what is there, then follow agent_onboard to set the project up.',
  '- If prompts or guides are missing, use guide_status, then guide_install or guide_update.',
  '- Call storage_backup before bulk edits to project data.',
].join('\n');
