import { describe, it, expect } from 'vitest';
import { CONFIG_KEYS } from '../../src/config/ConfigKeys.js';

describe('CONFIG_KEYS', () => {
  it('every entry has a valid scope', () => {
    for (const [key, def] of Object.entries(CONFIG_KEYS)) {
      expect(['shared', 'personal'], `${key} has an invalid scope`).toContain(def.scope);
    }
  });

  it('classifies git.integration_branch as personal', () => {
    expect(CONFIG_KEYS['git.integration_branch'].scope).toBe('personal');
  });

  it('classifies guide.source and workflow.review_enabled as shared', () => {
    expect(CONFIG_KEYS['guide.source'].scope).toBe('shared');
    expect(CONFIG_KEYS['workflow.review_enabled'].scope).toBe('shared');
  });
});

describe('rules.exclude', () => {
  const def = CONFIG_KEYS['rules.exclude'];

  it('is a shared string key defaulting to empty', () => {
    expect(def).toBeDefined();
    expect(def.type).toBe('string');
    expect(def.default).toBe('');
    // "This project has no Dart code" is a property of the project, not of
    // the developer, so every contributor gets the same exclusions.
    expect(def.scope).toBe('shared');
  });

  it('names its consumer in the description', () => {
    // Someone reading `cf config get rules.exclude` should not have to guess
    // who acts on it — cf stores and validates, the guide script acts.
    expect(def.description).toContain('setup-ide');
  });

  it('accepts empty as the identity default', () => {
    expect(def.validate?.('')).toBeNull();
  });

  it('accepts a well-formed multi-glob list', () => {
    expect(def.validate?.('dart.md')).toBeNull();
    expect(def.validate?.('dart.md,swift*.md')).toBeNull();
    expect(def.validate?.('dart.md,swift*.md,kotlin.md')).toBeNull();
  });

  it('rejects surrounding whitespace on an entry', () => {
    // The consuming bash `case` matches literally, so " swift*.md" would
    // silently never match.
    const result = def.validate?.('dart.md, swift*.md');
    expect(result).toBeTruthy();
    expect(result).toContain('whitespace');
  });

  it('rejects leading and trailing whitespace anywhere in the list', () => {
    expect(def.validate?.(' dart.md')).toBeTruthy();
    expect(def.validate?.('dart.md ')).toBeTruthy();
    expect(def.validate?.('dart.md ,swift.md')).toBeTruthy();
  });

  it('rejects an empty entry from a doubled or trailing comma', () => {
    const doubled = def.validate?.('dart.md,,swift.md');
    expect(doubled).toBeTruthy();
    expect(doubled).toContain('comma');

    expect(def.validate?.('dart.md,')).toBeTruthy();
    expect(def.validate?.(',dart.md')).toBeTruthy();
  });

  it('names the offending entry so the message is actionable', () => {
    expect(def.validate?.('dart.md, swift*.md')).toContain('swift*.md');
  });
});
