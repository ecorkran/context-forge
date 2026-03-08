import { describe, it, expect, beforeAll } from 'vitest';
import { ContextProfileParser } from '../../src/services/ContextProfileParser.js';

const SAMPLE_FILE = `---
frontmatter: here
---
## Prompts
Some intro text.

\`\`\`yaml type: context-profiles
context-profiles:
  implementation:
    variables: [fileSlicePlan, fileSlice, fileTasks]
  task-breakdown:
    variables: [fileSlicePlan, fileSlice, fileTasks]
  slice-design:
    variables: [fileArch, fileSlicePlan]
  slice-planning:
    variables: [fileArch, fileHLD, fileSpec]
  architecture:
    variables: [fileHLD, fileSpec]
  concept:
    variables: [fileConcept, fileSpec]
  maintenance:
    variables: [fileTasks]
  analysis-processing:
    variables: [fileSlice, fileTasks]
  integration:
    variables: [fileSlicePlan, fileSlice, fileTasks]
  _default:
    variables: [fileArch, fileSlicePlan, fileSlice, fileTasks]
\`\`\`

##### Some heading
Rest of file.
`;

describe('ContextProfileParser', () => {
  const parser = new ContextProfileParser();

  describe('parseProfiles', () => {
    it('parses profiles from a file with a context-profiles block', () => {
      const profiles = parser.parseProfiles(SAMPLE_FILE);
      expect(profiles).toHaveProperty('implementation');
      expect(profiles['implementation'].variables).toEqual(['fileSlicePlan', 'fileSlice', 'fileTasks']);
      expect(profiles['maintenance'].variables).toEqual(['fileTasks']);
      expect(profiles['_default'].variables).toEqual(['fileArch', 'fileSlicePlan', 'fileSlice', 'fileTasks']);
    });

    it('returns empty map when block is absent', () => {
      const profiles = parser.parseProfiles('No profiles block here.');
      expect(profiles).toEqual({});
    });

    it('returns empty map when block is malformed (no closing fence)', () => {
      const malformed = '```yaml type: context-profiles\ncontext-profiles:\n  bad:\n    variables: [x]\n';
      const profiles = parser.parseProfiles(malformed);
      expect(profiles).toEqual({});
    });

    it('parses all 10 profiles', () => {
      const profiles = parser.parseProfiles(SAMPLE_FILE);
      expect(Object.keys(profiles)).toHaveLength(10);
    });
  });

  describe('getProfileForInstruction', () => {
    let profiles: ReturnType<typeof parser.parseProfiles>;

    beforeAll(() => {
      profiles = parser.parseProfiles(SAMPLE_FILE);
    });

    it('resolves full phase string "Phase 6: Implementation" to implementation profile', () => {
      const vars = parser.getProfileForInstruction('Phase 6: Implementation', profiles);
      expect(vars).toEqual(['fileSlicePlan', 'fileSlice', 'fileTasks']);
    });

    it('resolves short name "implementation" directly', () => {
      const vars = parser.getProfileForInstruction('implementation', profiles);
      expect(vars).toEqual(['fileSlicePlan', 'fileSlice', 'fileTasks']);
    });

    it('resolves "Maintenance Task" to maintenance profile', () => {
      const vars = parser.getProfileForInstruction('Maintenance Task', profiles);
      expect(vars).toEqual(['fileTasks']);
    });

    it('resolves "Perform Routine Maintenance" to maintenance profile', () => {
      const vars = parser.getProfileForInstruction('Perform Routine Maintenance', profiles);
      expect(vars).toEqual(['fileTasks']);
    });

    it('resolves "Analysis Processing" to analysis-processing profile', () => {
      const vars = parser.getProfileForInstruction('Analysis Processing', profiles);
      expect(vars).toEqual(['fileSlice', 'fileTasks']);
    });

    it('falls back to _default for unknown instruction type', () => {
      const vars = parser.getProfileForInstruction('unknown-type', profiles);
      expect(vars).toEqual(['fileArch', 'fileSlicePlan', 'fileSlice', 'fileTasks']);
    });

    it('returns empty array when profiles map is empty', () => {
      const vars = parser.getProfileForInstruction('implementation', {});
      expect(vars).toEqual([]);
    });
  });
});
