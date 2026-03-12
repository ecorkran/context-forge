/**
 * Project schema definition — single source of truth for field metadata,
 * aliases, phase maps, and enum definitions.
 */

export type FieldGroup = 'identity' | 'artifacts' | 'workflow' | 'metadata' | 'custom';

export interface FieldDefinition {
  field: string;
  type: string;
  required: boolean;
  readonly: boolean;
  group: FieldGroup;
  description: string;
  aliases: string[];
  label: string;
  enumValues?: string[];
}

// Phase display strings
const PHASE_STRINGS = [
  'Phase 1: Concept',
  'Phase 2: Architecture',
  'Phase 3: Slice Planning',
  'Phase 4: Slice Design',
  'Phase 5: Task Breakdown',
  'Phase 6: Implementation',
  'Phase 7: Integration',
] as const;

const SPECIAL_PHASES = ['Ad-Hoc Tasks', 'Custom Instruction'] as const;

const ALL_PHASE_VALUES: string[] = [...PHASE_STRINGS, ...SPECIAL_PHASES];

/** Maps phase numbers and short names to full phase strings. */
export const PHASE_MAP: Record<string, string> = {
  // Number shortcuts
  '1': 'Phase 1: Concept',
  '2': 'Phase 2: Architecture',
  '3': 'Phase 3: Slice Planning',
  '4': 'Phase 4: Slice Design',
  '5': 'Phase 5: Task Breakdown',
  '6': 'Phase 6: Implementation',
  '7': 'Phase 7: Integration',
  // P-prefix shortcuts (P1–P7)
  'p1': 'Phase 1: Concept',
  'p2': 'Phase 2: Architecture',
  'p3': 'Phase 3: Slice Planning',
  'p4': 'Phase 4: Slice Design',
  'p5': 'Phase 5: Task Breakdown',
  'p6': 'Phase 6: Implementation',
  'p7': 'Phase 7: Integration',
  // Short name shortcuts
  'concept': 'Phase 1: Concept',
  'architecture': 'Phase 2: Architecture',
  'slice-planning': 'Phase 3: Slice Planning',
  'slice-design': 'Phase 4: Slice Design',
  'task-breakdown': 'Phase 5: Task Breakdown',
  'implementation': 'Phase 6: Implementation',
  'integration': 'Phase 7: Integration',
  // Special phases
  'ad-hoc-tasks': 'Ad-Hoc Tasks',
  'custom-instruction': 'Custom Instruction',
};

/** All field definitions for ProjectData. */
export const PROJECT_FIELDS: FieldDefinition[] = [
  // Identity
  { field: 'name', type: 'string', required: true, readonly: false, group: 'identity', description: 'Project display name', aliases: [], label: 'Name' },
  { field: 'id', type: 'string', required: false, readonly: true, group: 'identity', description: 'Auto-generated project identifier', aliases: [], label: 'ID' },
  { field: 'projectPath', type: 'string', required: true, readonly: false, group: 'identity', description: 'Absolute path to project directory', aliases: ['path'], label: 'Path' },
  { field: 'template', type: 'string', required: false, readonly: false, group: 'identity', description: 'Context template name', aliases: [], label: 'Template' },

  // Artifacts — ordered by methodology progression: spec → hld → arch → plan → slice → tasks
  { field: 'fileSpec', type: 'string', required: false, readonly: false, group: 'artifacts', description: 'Project specification path', aliases: ['spec'], label: 'Spec' },
  { field: 'fileHLD', type: 'string', required: false, readonly: false, group: 'artifacts', description: 'High-level design document path', aliases: ['hld'], label: 'HLD' },
  { field: 'fileConcept', type: 'string', required: false, readonly: false, group: 'artifacts', description: 'Concept document path (relative)', aliases: ['concept'], label: 'Concept' },
  { field: 'fileArch', type: 'string', required: false, readonly: false, group: 'artifacts', description: 'Architecture document path (relative)', aliases: ['arch'], label: 'Architecture' },
  { field: 'fileSlicePlan', type: 'string', required: false, readonly: false, group: 'artifacts', description: 'Slice plan document path (relative)', aliases: ['plan'], label: 'Slice Plan' },
  { field: 'fileSlice', type: 'string', required: false, readonly: false, group: 'artifacts', description: 'Current slice design path (relative)', aliases: ['slice'], label: 'Slice' },
  { field: 'fileTasks', type: 'string', required: false, readonly: false, group: 'artifacts', description: 'Current tasks file path (relative)', aliases: ['task'], label: 'Tasks' },

  // Workflow
  { field: 'developmentPhase', type: 'string', required: false, readonly: false, group: 'workflow', description: 'Current methodology phase', aliases: ['phase'], label: 'Phase', enumValues: ALL_PHASE_VALUES },
  { field: 'instruction', type: 'string', required: false, readonly: false, group: 'workflow', description: 'Active instruction/phase for context', aliases: [], label: 'Instruction', enumValues: ALL_PHASE_VALUES },
  { field: 'workType', type: 'string', required: false, readonly: false, group: 'workflow', description: 'Whether starting or continuing work', aliases: [], label: 'Work Type', enumValues: ['start', 'continue'] },
  { field: 'dateProject', type: 'string', required: false, readonly: false, group: 'workflow', description: 'Project date for context', aliases: ['date'], label: 'Date' },

  // Metadata
  { field: 'createdAt', type: 'string', required: false, readonly: true, group: 'metadata', description: 'Timestamp of project creation', aliases: [], label: 'Created' },
  { field: 'updatedAt', type: 'string', required: false, readonly: true, group: 'metadata', description: 'Timestamp of last update', aliases: [], label: 'Updated' },

  // Custom
  { field: 'customData.recentEvents', type: 'string', required: false, readonly: false, group: 'custom', description: 'State summary and recent events', aliases: ['events'], label: 'Recent Events' },
  { field: 'customData.additionalNotes', type: 'string', required: false, readonly: false, group: 'custom', description: 'Phase instructions and notes', aliases: ['notes'], label: 'Notes' },
  { field: 'customData.availableTools', type: 'string', required: false, readonly: false, group: 'custom', description: 'Available tools for context', aliases: ['tools'], label: 'Tools' },
];

/** Maps aliases to canonical field names, derived from PROJECT_FIELDS. */
export const FIELD_ALIASES: Record<string, string> = Object.fromEntries(
  PROJECT_FIELDS.flatMap((f) =>
    f.aliases.map((alias) => [alias, f.field]),
  ),
);

// Build a lowercase lookup map for canonical fields and aliases
const fieldLookup: Record<string, string> = {};
for (const f of PROJECT_FIELDS) {
  fieldLookup[f.field.toLowerCase()] = f.field;
  for (const alias of f.aliases) {
    fieldLookup[alias.toLowerCase()] = f.field;
  }
}

// Build a lowercase lookup map for phase values
const phaseLookup: Record<string, string> = {};
for (const [key, val] of Object.entries(PHASE_MAP)) {
  phaseLookup[key.toLowerCase()] = val;
}
// Also add full phase strings for passthrough
for (const phase of ALL_PHASE_VALUES) {
  phaseLookup[phase.toLowerCase()] = phase;
}

/**
 * Resolve a user-provided field name to its canonical ProjectData field name.
 * Supports aliases and case-insensitive matching.
 * Returns undefined if the input doesn't match any known field.
 */
export function resolveFieldName(input: string): string | undefined {
  return fieldLookup[input.toLowerCase()];
}

/**
 * Resolve a user-provided phase value to the full phase string.
 * Accepts phase numbers (1-7), short names, or full strings.
 * Case-insensitive. Returns undefined if no match.
 */
export function resolvePhaseValue(input: string): string | undefined {
  return phaseLookup[input.toLowerCase()];
}

/**
 * Validate a value against a field's enum constraints.
 * Returns { valid: true } for non-enum fields or valid values.
 * Returns { valid: false, error: '...' } for invalid enum values.
 */
export function validateFieldValue(
  field: string,
  value: string,
): { valid: boolean; error?: string } {
  const def = PROJECT_FIELDS.find((f) => f.field === field);
  if (!def?.enumValues) {
    return { valid: true };
  }

  if (def.enumValues.includes(value)) {
    return { valid: true };
  }

  return {
    valid: false,
    error: `Invalid value "${value}" for field "${field}". Allowed values: ${def.enumValues.join(', ')}`,
  };
}

/** Field group display order. */
export const FIELD_GROUPS: FieldGroup[] = ['identity', 'artifacts', 'workflow', 'metadata', 'custom'];

/**
 * Returns the full schema structure for external consumption (MCP, CLI --schema).
 */
export function getSchema(): {
  fields: FieldDefinition[];
  aliases: Record<string, string>;
  groups: FieldGroup[];
} {
  return {
    fields: PROJECT_FIELDS,
    aliases: FIELD_ALIASES,
    groups: FIELD_GROUPS,
  };
}
