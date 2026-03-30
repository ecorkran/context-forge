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
