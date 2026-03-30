/**
 * Machine-readable frontmatter schema registry.
 * Maps each docType to its required YAML frontmatter fields.
 * Source of truth derived from file-naming-conventions.md.
 */

/** Definition of a single frontmatter field's constraints. */
export interface FrontmatterFieldDef {
  required: boolean;
  /** Valid values. Omit for free-text fields. */
  values?: string[];
}

/** Schema for a single docType's frontmatter. */
export interface DocTypeSchema {
  fields: Record<string, FrontmatterFieldDef>;
}

/** A single validation finding from frontmatter schema checking. */
export interface FrontmatterFinding {
  rule: string;
  severity: 'warning' | 'error';
  filePath: string;
  description: string;
  fixAction?: { type: string; field: string; value: string };
}

/** Canonical valid status values across all docTypes. */
export const VALID_STATUSES = [
  'not_started',
  'in_progress',
  'complete',
  'deferred',
  'deprecated',
] as const;

/** Per-docType frontmatter schemas — required fields only. */
export const FRONTMATTER_SCHEMAS: Record<string, DocTypeSchema> = {
  concept: {
    fields: {
      docType: { required: true, values: ['concept'] },
      project: { required: true },
      status: { required: true, values: [...VALID_STATUSES] },
      dateCreated: { required: true },
      dateUpdated: { required: true },
    },
  },
  'initiative-plan': {
    fields: {
      docType: { required: true, values: ['initiative-plan'] },
      project: { required: true },
      status: { required: true, values: [...VALID_STATUSES] },
      dateCreated: { required: true },
      dateUpdated: { required: true },
    },
  },
  architecture: {
    fields: {
      docType: { required: true, values: ['architecture'] },
      project: { required: true },
      status: { required: true, values: [...VALID_STATUSES] },
      archIndex: { required: true },
      component: { required: true },
      dateCreated: { required: true },
      dateUpdated: { required: true },
    },
  },
  'slice-plan': {
    fields: {
      docType: { required: true, values: ['slice-plan'] },
      project: { required: true },
      status: { required: true, values: [...VALID_STATUSES] },
      dateCreated: { required: true },
      dateUpdated: { required: true },
    },
  },
  'slice-design': {
    fields: {
      docType: { required: true, values: ['slice-design'] },
      slice: { required: true },
      project: { required: true },
      status: { required: true, values: [...VALID_STATUSES] },
      dateCreated: { required: true },
      dateUpdated: { required: true },
    },
  },
  tasks: {
    fields: {
      docType: { required: true, values: ['tasks'] },
      slice: { required: true },
      project: { required: true },
      status: { required: true, values: [...VALID_STATUSES] },
      dateCreated: { required: true },
      dateUpdated: { required: true },
    },
  },
  review: {
    fields: {
      docType: { required: true, values: ['review'] },
      project: { required: true },
      status: { required: true, values: [...VALID_STATUSES] },
      dateCreated: { required: true },
      dateUpdated: { required: true },
    },
  },
  analysis: {
    fields: {
      docType: { required: true, values: ['analysis'] },
      project: { required: true },
      status: { required: true, values: [...VALID_STATUSES] },
      dateCreated: { required: true },
      dateUpdated: { required: true },
    },
  },
};

/**
 * Validate frontmatter data against the schema for its docType.
 * Returns findings for missing required fields and invalid values.
 */
export function validateFrontmatter(
  filePath: string,
  data: Record<string, string>,
): FrontmatterFinding[] {
  const findings: FrontmatterFinding[] = [];

  // Step 1: docType must be present
  if (!data.docType || data.docType.trim() === '') {
    findings.push({
      rule: 'frontmatter-schema',
      severity: 'warning',
      filePath,
      description: 'Missing required field \'docType\'',
    });
    return findings;
  }

  // Step 2: look up schema — unknown docTypes pass through
  const schema = FRONTMATTER_SCHEMAS[data.docType];
  if (!schema) return findings;

  // Step 3: check required fields
  for (const [field, def] of Object.entries(schema.fields)) {
    if (field === 'docType') continue; // already validated by presence
    if (!def.required) continue;

    const value = data[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      const finding: FrontmatterFinding = {
        rule: 'frontmatter-schema',
        severity: 'warning',
        filePath,
        description: `Missing required field '${field}' for docType '${data.docType}'`,
      };
      // Status is auto-fixable with default value
      if (field === 'status') {
        finding.fixAction = { type: 'update-frontmatter', field: 'status', value: 'not_started' };
      }
      findings.push(finding);
    }
  }

  // Step 4: check value constraints on present fields
  for (const [field, def] of Object.entries(schema.fields)) {
    if (!def.values) continue;

    const value = data[field];
    if (value === undefined || value === null || String(value).trim() === '') continue;

    const normalizedValue = String(value).trim();
    // For status field: accept hyphens as underscores, 'completed' as 'complete'
    let effectiveValue = normalizedValue;
    if (field === 'status') {
      effectiveValue = effectiveValue.replace(/-/g, '_');
      if (effectiveValue === 'completed') effectiveValue = 'complete';
    }

    if (!def.values.includes(effectiveValue)) {
      findings.push({
        rule: 'frontmatter-schema',
        severity: 'warning',
        filePath,
        description: `Invalid value '${normalizedValue}' for field '${field}' on docType '${data.docType}' (expected: ${def.values.join(', ')})`,
      });
    }
  }

  return findings;
}
