/**
 * Parses context-profiles YAML blocks from prompt asset files.
 * Profiles declare which artifact variables each instruction type uses,
 * enabling profile-aware filtering in ContextIntegrator.
 */

export type ProfileMap = Record<string, { variables: string[] }>;

/** Fence annotation identifying the context-profiles block */
const PROFILE_FENCE = '```yaml type: context-profiles';

/**
 * Inline YAML parser for the flat context-profiles block.
 * Handles the structure:
 *   context-profiles:
 *     profile-name:
 *       variables: [field1, field2, ...]
 */
function parseProfilesYaml(yaml: string): ProfileMap {
  const result: ProfileMap = {};
  const lines = yaml.split('\n');

  let currentProfile: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Top-level key: context-profiles (skip)
    if (line === 'context-profiles:') continue;

    // Profile name (2-space indent, ends with colon)
    const profileMatch = line.match(/^  ([\w-]+):$/);
    if (profileMatch) {
      currentProfile = profileMatch[1];
      result[currentProfile] = { variables: [] };
      continue;
    }

    // Variables line (4-space indent, bracket list)
    if (currentProfile) {
      const varsMatch = line.match(/^    variables:\s*\[([^\]]*)\]/);
      if (varsMatch) {
        const vars = varsMatch[1]
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean);
        result[currentProfile].variables = vars;
      }
    }
  }

  return result;
}

/**
 * Maps full phase strings and special instruction names to kebab-case keys
 * used in context-profiles. Mirrors the normalisation in resolvePhaseValue.
 */
const INSTRUCTION_NORMALISATION: Record<string, string> = {
  // Full phase strings (lowercase)
  'phase 1: concept': 'concept',
  'phase 2: architecture': 'architecture',
  'phase 3: slice planning': 'slice-planning',
  'phase 4: slice design': 'slice-design',
  'phase 5: task breakdown': 'task-breakdown',
  'phase 6: implementation': 'implementation',
  'phase 7: integration': 'integration',
  // Special instruction names
  'maintenance task': 'maintenance',
  'perform routine maintenance': 'maintenance',
  'analysis processing': 'analysis-processing',
  // Number shortcuts
  '1': 'concept',
  '2': 'architecture',
  '3': 'slice-planning',
  '4': 'slice-design',
  '5': 'task-breakdown',
  '6': 'implementation',
  '7': 'integration',
};

export class ContextProfileParser {
  /**
   * Finds and parses the context-profiles YAML block from file content.
   * Returns an empty ProfileMap if the block is absent or malformed.
   */
  parseProfiles(fileContent: string): ProfileMap {
    try {
      const fenceStart = fileContent.indexOf(PROFILE_FENCE);
      if (fenceStart === -1) return {};

      const contentStart = fileContent.indexOf('\n', fenceStart) + 1;
      const fenceEnd = fileContent.indexOf('\n```', contentStart);
      if (fenceEnd === -1) return {};

      const yamlContent = fileContent.slice(contentStart, fenceEnd);
      const parsed = parseProfilesYaml(yamlContent);

      // Validate: must have at least one profile with variables
      const hasProfiles = Object.values(parsed).some((p) => p.variables.length > 0);
      return hasProfiles ? parsed : {};
    } catch {
      return {};
    }
  }

  /**
   * Returns the variable list for a given instruction type.
   * Normalises phase strings (e.g. "Phase 6: Implementation" → "implementation").
   * Falls back to `_default` profile if the instruction has no explicit entry.
   * Returns [] if profiles is empty (caller should skip filtering).
   */
  getProfileForInstruction(instruction: string, profiles: ProfileMap): string[] {
    if (Object.keys(profiles).length === 0) return [];

    const normalised = this.normaliseInstruction(instruction);

    if (profiles[normalised]) {
      return profiles[normalised].variables;
    }

    if (profiles['_default']) {
      return profiles['_default'].variables;
    }

    return [];
  }

  private normaliseInstruction(instruction: string): string {
    const lower = instruction.toLowerCase().trim();
    return INSTRUCTION_NORMALISATION[lower] ?? lower;
  }
}
