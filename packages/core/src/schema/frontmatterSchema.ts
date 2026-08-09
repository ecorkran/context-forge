/**
 * Machine-readable frontmatter schema registry.
 * Maps each docType to its required YAML frontmatter fields.
 * Source of truth derived from file-naming-conventions.md.
 */

import { STATUS } from '../introspection/types.js';
import { suggestStatus } from '../introspection/parsers/statusNormalizer.js';

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
export const VALID_STATUSES = Object.values(STATUS);

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
      // Review-exempt declaration (#57): absent (default) means the slice/tasks/code
      // review gates apply normally; 'none' lets evaluateReviewGate() skip all three
      // for a slice that cannot produce them (docs, analysis, minimal-doc, etc).
      // Does not affect the architecture (preSlicePlan) gate — that gates a
      // different document (the architecture index), not this slice-design.
      review: { required: false, values: ['none'] },
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

/** Map filename segment (from NNN-segment.name.md) to docType. */
const FILENAME_SEGMENT_TO_DOCTYPE: Record<string, string> = {
  arch: 'architecture',
  slices: 'slice-plan',
  slice: 'slice-design',
  tasks: 'tasks',
  review: 'review',
  analysis: 'analysis',
  concept: 'concept',
};

/** Parse a methodology filename into its parts: index, segment, name. */
const FILENAME_PARTS_RE = /^(\d+)-(arch|slices|slice|tasks|review|analysis|concept)\.(.+?)(?:-\d+)?\.md$/i;

/**
 * Infer docType from a file path based on naming conventions.
 * Returns the docType string or null if not inferrable.
 */
export function inferDocTypeFromPath(filePath: string): string | null {
  const basename = filePath.split('/').pop() ?? '';
  const match = FILENAME_PARTS_RE.exec(basename);
  if (!match) return null;
  return FILENAME_SEGMENT_TO_DOCTYPE[match[2].toLowerCase()] ?? null;
}

/**
 * Infer frontmatter field values from a file path based on naming conventions.
 * Returns a map of field → inferred value for fields that can be derived.
 */
export function inferFieldsFromPath(filePath: string): Record<string, string> {
  const basename = filePath.split('/').pop() ?? '';
  const match = FILENAME_PARTS_RE.exec(basename);
  if (!match) return {};

  const [, index, segment, name] = match;
  const inferred: Record<string, string> = {};
  const docType = FILENAME_SEGMENT_TO_DOCTYPE[segment.toLowerCase()];

  if (docType) inferred.docType = docType;

  // Infer 'slice' for slice-design and tasks (the name portion is the slice name)
  if (docType === 'slice-design' || docType === 'tasks') {
    inferred.slice = name;
  }

  // Infer 'archIndex' and 'component' for architecture docs
  if (docType === 'architecture') {
    inferred.archIndex = index;
    inferred.component = name;
  }

  return inferred;
}

/**
 * Validate frontmatter data against the schema for its docType.
 * Returns findings for missing required fields and invalid values.
 */
export function validateFrontmatter(
  filePath: string,
  data: Record<string, string>,
  options?: { projectName?: string },
): FrontmatterFinding[] {
  const findings: FrontmatterFinding[] = [];

  // Step 1: docType must be present
  if (!data.docType || data.docType.trim() === '') {
    const inferred = inferDocTypeFromPath(filePath);
    const finding: FrontmatterFinding = {
      rule: 'frontmatter-schema',
      severity: 'warning',
      filePath,
      description: inferred
        ? `Missing required field 'docType' (inferred: '${inferred}')`
        : 'Missing required field \'docType\'',
    };
    if (inferred) {
      finding.fixAction = { type: 'update-frontmatter', field: 'docType', value: inferred };
    }
    findings.push(finding);
    return findings;
  }

  // Step 2: look up schema — unknown docTypes pass through
  const schema = FRONTMATTER_SCHEMAS[data.docType];
  if (!schema) return findings;

  // Step 3: check required fields
  const inferred = inferFieldsFromPath(filePath);
  for (const [field, def] of Object.entries(schema.fields)) {
    if (field === 'docType') continue; // already validated by presence
    if (!def.required) continue;

    const value = data[field];
    if (value === undefined || value === null || String(value).trim() === '') {
      // Determine if we can auto-fix this field
      let fixValue: string | undefined;
      if (field === 'status') {
        fixValue = STATUS.NotStarted;
      } else if (field === 'dateUpdated' && data.dateCreated && String(data.dateCreated).trim() !== '') {
        fixValue = String(data.dateCreated).trim();
      } else if (field === 'project' && options?.projectName) {
        fixValue = options.projectName;
      } else if (inferred[field]) {
        fixValue = inferred[field];
      }

      const description = fixValue
        ? `Missing required field '${field}' for docType '${data.docType}' (inferred: '${fixValue}')`
        : `Missing required field '${field}' for docType '${data.docType}'`;

      const finding: FrontmatterFinding = {
        rule: 'frontmatter-schema',
        severity: 'warning',
        filePath,
        description,
      };
      if (fixValue) {
        finding.fixAction = { type: 'update-frontmatter', field, value: fixValue };
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
    // Validation is strict: compare the value as written against def.values directly.
    // For status specifically, this means only the canonical VALID_STATUSES spellings
    // pass — historical aliases like 'in-progress' are rejected here even though
    // normalizeStatus() (used elsewhere, e.g. cf list/status) still reads them leniently.
    // The two are intentionally asymmetric: read leniently, validate strictly. When the
    // intended canonical value is recoverable (alias or close typo), the finding carries
    // a fixAction so `cf check --fix` migrates the document instead of stranding it.
    if (!def.values.includes(normalizedValue)) {
      const suggestion = field === 'status' ? suggestStatus(normalizedValue) : undefined;
      const finding: FrontmatterFinding = {
        rule: 'frontmatter-schema',
        severity: 'warning',
        filePath,
        description: suggestion
          ? `Invalid value '${normalizedValue}' for field '${field}' on docType '${data.docType}' (expected: ${def.values.join(', ')}; will fix to '${suggestion}')`
          : `Invalid value '${normalizedValue}' for field '${field}' on docType '${data.docType}' (expected: ${def.values.join(', ')})`,
      };
      if (suggestion) {
        finding.fixAction = { type: 'update-frontmatter', field, value: suggestion };
      }
      findings.push(finding);
    }
  }

  return findings;
}
