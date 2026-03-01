export interface ConfigKeyDefinition {
  type: 'string' | 'boolean' | 'number';
  default: string | boolean | number;
  description: string;
  enum?: string[];
  validate?: (value: string | boolean | number) => string | null;
}

export const CONFIG_KEYS: Record<string, ConfigKeyDefinition> = {
  default_project: {
    type: 'string',
    default: '',
    description: 'Default project ID used when projectId is not provided to MCP tools',
  },
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
};
