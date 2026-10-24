/** Shared fixtures for the rule-resolution install tests (slice 266). */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RuleResolution } from '@context-forge/core/node';
import { RESOLUTIONS_HEADING } from '../../src/ideInstall/resolutions.js';
import { writeFiles } from './harness.js';

/** Project text the install must leave alone; also the resolution's project source. */
export const HAND_WRITTEN_CLAUDE = '# Team rules\nNever commit directly to main.\n';

/** A resolution on a fixture alwaysApply rule against the hand-written CLAUDE.md. */
export const FIXTURE_RESOLUTION: RuleResolution = {
  guideRule: 'always-a.md',
  projectSource: 'CLAUDE.md',
  statement: 'Every change goes through a PR.',
};

export const STRIP_ANSI = /\x1b\[[0-9;]*m/g;

/** The rendered resolution bullet for a record. */
export function bullet(r: RuleResolution): string {
  return `- \`${r.guideRule}\` vs \`${r.projectSource}\`: ${r.statement}`;
}

/** Writes the hand-written CLAUDE.md the fixture resolution points at. */
export function writeProjectRules(project: string): void {
  writeFiles(project, { 'CLAUDE.md': HAND_WRITTEN_CLAUDE });
}

export function read(root: string, rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf-8');
}

/** The resolutions section of a composite: heading through the line before END. */
export function sectionOf(text: string): string {
  const start = text.indexOf(RESOLUTIONS_HEADING);
  if (start === -1) throw new Error(`no ${RESOLUTIONS_HEADING} in:\n${text}`);
  return text.slice(start, text.indexOf('<!-- END:context-forge -->', start));
}
