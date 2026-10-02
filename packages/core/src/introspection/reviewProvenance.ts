/**
 * Review-verdict provenance (slice 928 TD-3). Squadron reports how it obtained a
 * verdict via two optional frontmatter fields; this module is the single source of
 * their names and recognized tokens. Untrusted external data: never throws.
 */
export const PROVENANCE = {
  /** squadron slice 919 D6: whether the model stated the verdict or squadron derived it */
  verdictSourceField: 'verdictSource',
  stated: 'stated',
  derived: 'derived',
  /** squadron slice 924: the verdict came from a second, recovery prompt */
  recoveryTurnField: 'recoveryTurn',
  recoveryTrue: 'true',
  recoveryFalse: 'false',
} as const;

export type EvidenceStrength = 'strong' | 'weak';

/** Trimmed, lowercased value; an empty value counts as absent. */
function normalized(raw: string | undefined): string | undefined {
  const value = raw?.trim().toLowerCase();
  return value === '' ? undefined : value;
}

/**
 * Human descriptions of each weak-provenance signal in a review's frontmatter, or an
 * empty list when there are none. Absent fields are no signal; present-but-unrecognized
 * values are weak (TD-3).
 */
export function weakEvidenceSignals(data: Readonly<Record<string, string>>): string[] {
  const signals: string[] = [];

  const sourceRaw = data[PROVENANCE.verdictSourceField];
  const source = normalized(sourceRaw);
  if (source === PROVENANCE.derived) {
    signals.push('derived from finding severities');
  } else if (source !== undefined && source !== PROVENANCE.stated) {
    signals.push(`unrecognized ${PROVENANCE.verdictSourceField} '${sourceRaw}'`);
  }

  const recoveryRaw = data[PROVENANCE.recoveryTurnField];
  const recovery = normalized(recoveryRaw);
  if (recovery === PROVENANCE.recoveryTrue) {
    signals.push('recovered on a second prompt');
  } else if (recovery !== undefined && recovery !== PROVENANCE.recoveryFalse) {
    signals.push(`unrecognized ${PROVENANCE.recoveryTurnField} '${recoveryRaw}'`);
  }

  return signals;
}

/** Classifies a review's verdict evidence: weak when any provenance signal is present. */
export function classifyEvidence(data: Readonly<Record<string, string>>): EvidenceStrength {
  return weakEvidenceSignals(data).length > 0 ? 'weak' : 'strong';
}

/** One-line description of the weak signals, e.g. "derived from finding severities; recovered on a second prompt". */
export function describeWeakEvidence(data: Readonly<Record<string, string>>): string {
  return weakEvidenceSignals(data).join('; ');
}
