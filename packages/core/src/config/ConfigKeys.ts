export interface ConfigKeyDefinition {
  type: 'string' | 'boolean' | 'number';
  default: string | boolean | number;
  description: string;
  enum?: string[];
  validate?: (value: string | boolean | number) => string | null;
}

export const CONFIG_KEYS: Record<string, ConfigKeyDefinition> = {
  'guide.auto_update': {
    type: 'boolean',
    default: false,
    description: 'Whether to automatically update the AI project guide',
  },
  'guide.source': {
    type: 'string',
    default: '',
    description: 'URL or path to the AI project guide source',
  },
  'guide.git_strategy': {
    type: 'string',
    default: 'submodule',
    description: 'Strategy for managing the AI project guide via git',
    enum: ['submodule', 'clone', 'manual'],
  },
  'workflow.auto_advance': {
    type: 'boolean',
    default: false,
    description: 'Auto-advance to next slice when current is complete',
  },
  'workflow.auto_fix': {
    type: 'boolean',
    default: false,
    description: 'Automatically apply non-destructive corrections when running consistency checks',
  },
  'workflow.review_enabled': {
    type: 'boolean',
    default: false,
    description: 'Enable review gating in the workflow navigator (off by default; no behavior change when false)',
  },
  'workflow.review_threshold': {
    type: 'string',
    default: 'concerns',
    description:
      'Verdict floor that clears a review gate: "pass" requires PASS; "concerns" clears on PASS or CONCERNS',
    enum: ['pass', 'concerns'],
  },
  'workflow.review_unknown_as': {
    type: 'string',
    default: 'fail',
    description:
      'How to treat an UNKNOWN/absent/unparseable verdict: "fail" blocks, "concern" treats as CONCERNS, "pass" clears',
    enum: ['fail', 'concern', 'pass'],
  },
  'workflow.review_gates.pre_advance.review_type': {
    type: 'string',
    default: '',
    description:
      'Per-gate override: review type required before advancing past this slice (empty = use the global default; gate logic added in slice 241)',
  },
  'workflow.review_gates.pre_advance.threshold': {
    type: 'string',
    default: '',
    description:
      'Per-gate override: verdict floor for the pre-advance review gate (empty = use workflow.review_threshold)',
    enum: ['', 'pass', 'concerns'],
  },
  'workflow.review_gates.pre_slice_plan.review_type': {
    type: 'string',
    default: '',
    description:
      'Per-gate override: review type required before generating the slice plan (empty = use the global default; gate logic added in slice 241)',
  },
  'workflow.review_gates.pre_slice_plan.threshold': {
    type: 'string',
    default: '',
    description:
      'Per-gate override: verdict floor for the pre-slice-plan review gate (empty = use workflow.review_threshold)',
    enum: ['', 'pass', 'concerns'],
  },
  'workflow.review_gates.pre_tasks.review_type': {
    type: 'string',
    default: '',
    description:
      'Per-gate override: review type required before generating tasks (empty = use the global default; gate logic added in slice 241)',
  },
  'workflow.review_gates.pre_tasks.threshold': {
    type: 'string',
    default: '',
    description:
      'Per-gate override: verdict floor for the pre-tasks review gate (empty = use workflow.review_threshold)',
    enum: ['', 'pass', 'concerns'],
  },
  'workflow.review_gates.pre_implementation.review_type': {
    type: 'string',
    default: '',
    description:
      'Per-gate override: review type required before implementation begins (empty = use the global default; gate logic added in slice 241)',
  },
  'workflow.review_gates.pre_implementation.threshold': {
    type: 'string',
    default: '',
    description:
      'Per-gate override: verdict floor for the pre-implementation review gate (empty = use workflow.review_threshold)',
    enum: ['', 'pass', 'concerns'],
  },
  'git.branch_root': {
    type: 'string',
    default: '',
    description:
      'Optional path prefix prepended to work branch names (e.g. "myroot" yields "myroot/910-slice.foo"). Empty means no prefix. Relative and contained: must not be absolute or escape via "..".',
    validate: (value) => {
      if (typeof value !== 'string') return 'must be a string';
      if (value === '') return null; // empty = no prefix (identity default)
      if (value.startsWith('/')) return 'must be relative, not absolute';
      if (value.startsWith('\\') || /^[A-Za-z]:/.test(value)) {
        return 'must be relative, not an absolute Windows path';
      }
      if (value.split(/[/\\]/).includes('..')) return 'must not contain ".." segments';
      if (value.endsWith('/') || value.endsWith('\\')) return 'must not have a trailing slash';
      return null;
    },
  },
};
