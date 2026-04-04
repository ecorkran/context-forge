import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ContextProfileParser } from '../../src/services/ContextProfileParser.js';

/** Expanded multi-line format (profile key + variables child) */
const EXPANDED_FORMAT = `---
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

/** Compact one-line format (as used in the actual prompt.ai-project.system.md) */
const COMPACT_FORMAT = `---
frontmatter: here
---
### Context Profiles
\`\`\`yaml
context_profiles:
  concept-phase-0:                   []
  initiative-plan-phase-1:           [fileConcept]
  architecture-phase-2:              [fileConcept, fileArch]
  slice-planning-phase-3:            [fileArch, fileSlicePlan]
  slice-design-phase-4:              [fileArch, fileSlicePlan, fileSlice]
  task-breakdown-phase-5:            [fileSlice, fileTasks]
  implementation-phase-6:            [fileSlice, fileTasks]
  slice-integration-phase-7:         [fileArch, fileSlicePlan, fileSlice, fileTasks]
  maintenance-task:                  [fileTasks]
  maintenance-routine:               [fileSlice, fileTasks]
  analysis-processing:               [fileSlice, fileTasks]
  _default:                          [fileArch, fileSlicePlan, fileSlice, fileTasks]
\`\`\`
`;

describe('ContextProfileParser', () => {
  const parser = new ContextProfileParser();

  describe('parseProfiles — expanded format', () => {
    it('parses profiles and returns correct variable lists', () => {
      const profiles = parser.parseProfiles(EXPANDED_FORMAT);
      expect(profiles['implementation-phase-6']).toEqual(['fileSlice', 'fileTasks']);
      expect(profiles['maintenance-task']).toEqual(['fileTasks']);
      expect(profiles['_default']).toEqual(['fileArch', 'fileSlicePlan', 'fileSlice', 'fileTasks']);
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
      const profiles = parser.parseProfiles(EXPANDED_FORMAT);
      expect(Object.keys(profiles)).toHaveLength(12);
    });
  });

  describe('parseProfiles — compact format', () => {
    it('parses profiles and returns correct variable lists', () => {
      const profiles = parser.parseProfiles(COMPACT_FORMAT);
      expect(profiles['implementation-phase-6']).toEqual(['fileSlice', 'fileTasks']);
      expect(profiles['maintenance-task']).toEqual(['fileTasks']);
      expect(profiles['_default']).toEqual(['fileArch', 'fileSlicePlan', 'fileSlice', 'fileTasks']);
    });

    it('parses all 12 profiles', () => {
      const profiles = parser.parseProfiles(COMPACT_FORMAT);
      expect(Object.keys(profiles)).toHaveLength(12);
    });

    it('slice-design-phase-4 excludes fileTasks', () => {
      const profiles = parser.parseProfiles(COMPACT_FORMAT);
      expect(profiles['slice-design-phase-4']).toEqual(['fileArch', 'fileSlicePlan', 'fileSlice']);
      expect(profiles['slice-design-phase-4']).not.toContain('fileTasks');
    });

    it('concept-phase-0 has empty variable list', () => {
      const profiles = parser.parseProfiles(COMPACT_FORMAT);
      expect(profiles['concept-phase-0']).toEqual([]);
    });
  });

  describe('parseProfiles — real prompt file', () => {
    it('parses the actual project prompt file successfully', () => {
      const promptPath = join(__dirname, '..', '..', '..', '..', 'project-documents',
        'ai-project-guide', 'project-guides', 'prompt.ai-project.system.md');
      let content: string;
      try {
        content = readFileSync(promptPath, 'utf-8');
      } catch {
        // Skip if prompt file not installed (CI without guides)
        return;
      }

      const profiles = parser.parseProfiles(content);
      // Must parse at least several profiles
      expect(Object.keys(profiles).length).toBeGreaterThanOrEqual(8);
      // Phase 4 must not include fileTasks
      expect(profiles['slice-design-phase-4']).toBeDefined();
      expect(profiles['slice-design-phase-4']).not.toContain('fileTasks');
      // _default must exist
      expect(profiles['_default']).toBeDefined();
    });
  });

  describe('getProfileForInstruction', () => {
    let profiles: ReturnType<typeof parser.parseProfiles>;

    beforeAll(() => {
      profiles = parser.parseProfiles(COMPACT_FORMAT);
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

    it('resolves "Phase 4: Slice Design" excludes fileTasks', () => {
      const vars = parser.getProfileForInstruction('Phase 4: Slice Design', profiles);
      expect(vars).toEqual(['fileArch', 'fileSlicePlan', 'fileSlice']);
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
