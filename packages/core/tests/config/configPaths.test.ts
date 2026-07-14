import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { getProjectConfigPath, getProjectPersonalConfigPath } from '../../src/config/configPaths.js';

describe('configPaths', () => {
  it('getProjectConfigPath returns {projectPath}/.context-forge.toml', () => {
    expect(getProjectConfigPath('/some/project')).toBe(join('/some/project', '.context-forge.toml'));
  });

  it('getProjectPersonalConfigPath returns {projectPath}/.context-forge.local.toml', () => {
    expect(getProjectPersonalConfigPath('/some/project')).toBe(
      join('/some/project', '.context-forge.local.toml')
    );
  });
});
