export interface ConfigKeyDefinition {
  type: 'string' | 'boolean' | 'number';
  default: string | boolean | number;
  description: string;
  scope: 'shared' | 'personal';
  enum?: string[];
  validate?: (value: string | boolean | number) => string | null;
}

export const CONFIG_KEYS: Record<string, ConfigKeyDefinition> = {
  'guide.auto_update': {
    type: 'boolean',
    default: false,
    description: 'Whether to automatically update the AI project guide',
    scope: 'shared',
  },
  'guide.source': {
    type: 'string',
    default: '',
    description: 'URL or path to the AI project guide source',
    scope: 'shared',
  },
  'guide.git_strategy': {
    type: 'string',
    default: 'submodule',
    description: 'Strategy for managing the AI project guide via git',
    enum: ['submodule', 'clone', 'manual'],
    scope: 'shared',
  },
  'workflow.auto_advance': {
    type: 'boolean',
    default: false,
    description: 'Auto-advance to next slice when current is complete',
    scope: 'shared',
  },
  'workflow.auto_fix': {
    type: 'boolean',
    default: false,
    description: 'Automatically apply non-destructive corrections when running consistency checks',
    scope: 'shared',
  },
  'workflow.review_enabled': {
    type: 'boolean',
    default: false,
    description: 'Enable review gating in the workflow navigator (off by default; no behavior change when false)',
    scope: 'shared',
  },
  'workflow.review_threshold': {
    type: 'string',
    default: 'concerns',
    description:
      'Verdict floor that clears a review gate: "pass" requires PASS; "concerns" clears on PASS or CONCERNS',
    enum: ['pass', 'concerns'],
    scope: 'shared',
  },
  'workflow.review_unknown_as': {
    type: 'string',
    default: 'fail',
    description:
      'How to treat an UNKNOWN/absent/unparseable verdict: "fail" blocks, "concerns" treats as CONCERNS, "pass" clears',
    enum: ['fail', 'concerns', 'pass'],
    scope: 'shared',
  },
  'workflow.review_gates.code.threshold': {
    type: 'string',
    default: '',
    description:
      'Per-gate override: verdict floor for the code (pre-advance) review gate (empty = use workflow.review_threshold)',
    enum: ['', 'pass', 'concerns'],
    scope: 'shared',
  },
  'workflow.review_gates.arch.threshold': {
    type: 'string',
    default: '',
    description:
      'Per-gate override: verdict floor for the arch (pre-slice-plan) review gate (empty = use workflow.review_threshold)',
    enum: ['', 'pass', 'concerns'],
    scope: 'shared',
  },
  'workflow.review_gates.slice.threshold': {
    type: 'string',
    default: '',
    description:
      'Per-gate override: verdict floor for the slice (pre-tasks) review gate (empty = use workflow.review_threshold)',
    enum: ['', 'pass', 'concerns'],
    scope: 'shared',
  },
  'workflow.review_gates.tasks.threshold': {
    type: 'string',
    default: '',
    description:
      'Per-gate override: verdict floor for the tasks (pre-implementation) review gate (empty = use workflow.review_threshold)',
    enum: ['', 'pass', 'concerns'],
    scope: 'shared',
  },
  'workflow.review_gate_effective_date': {
    type: 'string',
    default: '',
    description:
      'Grandfathers slices/architecture designed before this date (YYYYMMDD, compared against the artifact\'s own dateCreated) out of every review gate boundary. Empty (default) applies no cutoff — every slice is subject to gating. Lets a project turn on review_enabled without retroactively demanding reviews for work completed before the gate existed.',
    scope: 'shared',
    validate: (value) => {
      if (typeof value !== 'string') return 'must be a string';
      if (value === '') return null; // empty = no cutoff (identity default)
      if (!/^\d{8}$/.test(value)) return 'must be in YYYYMMDD format (e.g. "20260701")';
      return null;
    },
  },
  'git.integration_branch': {
    type: 'string',
    default: '',
    description:
      'Optional long-lived integration branch that work branches fork from and merge into instead of main (e.g. "dev/erik" yields "dev/erik/910-slice.foo", forked from and merged into "dev/erik"). Empty means no integration branch — work branches fork from and merge into main directly. Relative and contained: must not be absolute or escape via "..".',
    scope: 'personal',
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
