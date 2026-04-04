/**
 * Parses context-profiles YAML blocks from prompt asset files.
 * Profiles declare which artifact variables each instruction type uses,
 * enabling profile-aware filtering in ContextIntegrator.
 */

export type ProfileMap = Record<string, string[]>;

/** Key identifying the context-profiles block; works with any yaml fence annotation */
const PROFILE_KEY = 'context_profiles:\n';

/** Matches a bracket-delimited list: [a, b, c] or [] */
const BRACKET_LIST = /\[([^\]]*)\]/;

/**
 * Parses the context_profiles YAML block into a ProfileMap.
 *
 * Handles two layout styles without relying on indent depth:
 *
 * Compact (one-liner):
 *   profile-name: [var1, var2]
 *
 * Expanded (two-liner):
 *   profile-name:
 *     variables: [var1, var2]
 *
 * The parser uses a simple state machine: when it sees a line with a
 * key (word-chars + hyphens) followed by a colon, it checks whether
 * the same line also contains a bracket list. If so, that's a compact
 * profile. If not, it remembers the key and looks for a bracket list
 * on a subsequent indented line.
 */
function parseProfilesYaml(yaml: string): ProfileMap {
  const result: ProfileMap = {};
  const lines = yaml.split('\n');

  // Pending profile name from a multi-line entry (e.g. "  profile-name:")
  let pendingProfile: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Skip the top-level header key
    if (/^\s*context[_-]profiles:\s*$/.test(line)) continue;

    // Skip blank lines
    if (line.trim() === '') continue;

    // Try to extract a key (word-chars/hyphens after leading whitespace, before colon)
    const keyMatch = line.match(/^\s+([\w-]+):\s*(.*)/);

    if (keyMatch) {
      const key = keyMatch[1];
      const rest = keyMatch[2];

      // Does this line also have a bracket list?
      const listMatch = rest.match(BRACKET_LIST);

      if (listMatch) {
        // Compact format OR expanded "variables: [...]" line
        const vars = listMatch[1].split(',').map((v) => v.trim()).filter(Boolean);

        if (key === 'variables' && pendingProfile) {
          // Expanded: assign to the pending profile
          result[pendingProfile] = vars;
          pendingProfile = null;
        } else if (key !== 'variables') {
          // Compact: key IS the profile name
          result[key] = vars;
          pendingProfile = null;
        }
      } else {
        // No bracket list — this is a multi-line profile header
        // (ignore 'variables' without a list, which shouldn't happen)
        if (key !== 'variables') {
          pendingProfile = key;
          result[key] = [];
        }
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
  'phase 0: concept': 'concept-phase-0',
  'phase 1: initiative plan': 'initiative-plan-phase-1',
  'phase 2: architecture': 'architecture-phase-2',
  'phase 3: slice planning': 'slice-planning-phase-3',
  'phase 4: slice design': 'slice-design-phase-4',
  'phase 5: task breakdown': 'task-breakdown-phase-5',
  'phase 6: implementation': 'implementation-phase-6',
  'phase 7: integration': 'slice-integration-phase-7',
  // Backward compat: pre-v0.14.0 "Phase 1: Concept"
  'phase 1: concept': 'concept-phase-0',
  // Special instruction names
  'maintenance task': 'maintenance-task',
  'perform routine maintenance': 'maintenance-routine',
  'analysis processing': 'analysis-processing',
  // Number shortcuts
  '0': 'concept-phase-0',
  '1': 'initiative-plan-phase-1',
  '2': 'architecture-phase-2',
  '3': 'slice-planning-phase-3',
  '4': 'slice-design-phase-4',
  '5': 'task-breakdown-phase-5',
  '6': 'implementation-phase-6',
  '7': 'slice-integration-phase-7',
  // Short name shortcuts
  'concept': 'concept-phase-0',
  'initiative-plan': 'initiative-plan-phase-1',
  'architecture': 'architecture-phase-2',
  'slice-planning': 'slice-planning-phase-3',
  'slice-design': 'slice-design-phase-4',
  'task-breakdown': 'task-breakdown-phase-5',
  'implementation': 'implementation-phase-6',
  'integration': 'slice-integration-phase-7',
};

export class ContextProfileParser {
  /**
   * Finds and parses the context-profiles YAML block from file content.
   * Returns an empty ProfileMap if the block is absent or malformed.
   */
  parseProfiles(fileContent: string): ProfileMap {
    try {
      // Find the context_profiles key inside any yaml fence
      const keyStart = fileContent.indexOf(PROFILE_KEY);
      if (keyStart === -1) return {};

      // Walk back to the opening fence
      const fenceStart = fileContent.lastIndexOf('\n```', keyStart);
      if (fenceStart === -1) return {};

      const contentStart = fileContent.indexOf('\n', fenceStart) + 1;
      const fenceEnd = fileContent.indexOf('\n```', contentStart);
      if (fenceEnd === -1) return {};

      const yamlContent = fileContent.slice(contentStart, fenceEnd);
      const parsed = parseProfilesYaml(yamlContent);

      // Validate: must have at least one profile with variables
      const hasProfiles = Object.values(parsed).some((vars) => vars.length > 0);
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
      return profiles[normalised];
    }

    if (profiles['_default']) {
      return profiles['_default'];
    }

    return [];
  }

  private normaliseInstruction(instruction: string): string {
    const lower = instruction.toLowerCase().trim();
    return INSTRUCTION_NORMALISATION[lower] ?? lower;
  }
}
