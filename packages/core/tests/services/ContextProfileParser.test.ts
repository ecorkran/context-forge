import { describe, it, expect, beforeAll } from 'vitest';
import { ContextProfileParser } from '../../src/services/ContextProfileParser.js';

const SAMPLE_FILE = `---
frontmatter: here
---
## Prompts
Some intro text.

\`\`\`yaml
context_profiles:
  concept-phase-0:
    variables: []
  initiative-plan-phase-1:
    variables: [fileConcept]
  architecture-phase-2:
    variables: [fileConcept, fileHLD, fileArch]
  slice-planning-phase-3:
    variables: [fileArch, fileSlicePlan]
  slice-design-phase-4:
    variables: [fileArch, fileSlicePlan, fileSlice]
  task-breakdown-phase-5:
    variables: [fileSlicePlan, fileSlice, fileTasks]
  implementation-phase-6:
    variables: [fileSlice, fileTasks]
  slice-integration-phase-7:
    variables: [fileArch, fileSlicePlan, fileSlice, fileTasks]
  maintenance-task:
    variables: [fileTasks]
  maintenance-routine:
    variables: [fileSlice, fileTasks]
  analysis-processing:
    variables: [fileSlice, fileTasks]
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
      expect(profiles).toHaveProperty('implementation-phase-6');
      expect(profiles['implementation-phase-6'].variables).toEqual(['fileSlice', 'fileTasks']);
      expect(profiles['maintenance-task'].variables).toEqual(['fileTasks']);
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

    it('parses all 12 profiles', () => {
      const profiles = parser.parseProfiles(SAMPLE_FILE);
      expect(Object.keys(profiles)).toHaveLength(12);
    });
  });

  describe('getProfileForInstruction', () => {
    let profiles: ReturnType<typeof parser.parseProfiles>;

    beforeAll(() => {
      profiles = parser.parseProfiles(SAMPLE_FILE);
    });

    it('resolves full phase string "Phase 6: Implementation" to implementation profile', () => {
      const vars = parser.getProfileForInstruction('Phase 6: Implementation', profiles);
      expect(vars).toEqual(['fileSlice', 'fileTasks']);
    });

    it('resolves short name "implementation" directly', () => {
      const vars = parser.getProfileForInstruction('implementation', profiles);
      expect(vars).toEqual(['fileSlice', 'fileTasks']);
    });

    it('resolves "Phase 0: Concept" to concept profile', () => {
      const vars = parser.getProfileForInstruction('Phase 0: Concept', profiles);
      expect(vars).toEqual([]);
    });

    it('resolves "Phase 1: Initiative Plan" to initiative-plan profile', () => {
      const vars = parser.getProfileForInstruction('Phase 1: Initiative Plan', profiles);
      expect(vars).toEqual(['fileConcept']);
    });

    it('resolves "Maintenance Task" to maintenance-task profile', () => {
      const vars = parser.getProfileForInstruction('Maintenance Task', profiles);
      expect(vars).toEqual(['fileTasks']);
    });

    it('resolves "Perform Routine Maintenance" to maintenance-routine profile', () => {
      const vars = parser.getProfileForInstruction('Perform Routine Maintenance', profiles);
      expect(vars).toEqual(['fileSlice', 'fileTasks']);
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
