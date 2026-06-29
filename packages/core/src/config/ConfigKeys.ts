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
