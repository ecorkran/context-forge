/**
 * Decision-gate Node I/O: the config switch and the design-file read.
 *
 * The parser itself is pure (`pendingDecisions.ts`). Callers turn the result
 * into their own output; nothing here builds findings or messages.
 */

import { readFile } from 'node:fs/promises';
import type { ConfigManager } from '../config/ConfigManager.js';
import { findPendingDecisions, type PendingDecision } from './pendingDecisions.js';

const DECISION_GATE_KEY = 'workflow.decision_gate_enabled';

/** Whether the decision gate is on. The registry default (true) applies when the key is unset. */
export async function isDecisionGateEnabled(config: ConfigManager): Promise<boolean> {
  const { value } = await config.get(DECISION_GATE_KEY);
  return value === true;
}

/**
 * Pending decisions in the design at `absPath`. Read errors propagate: a design
 * that cannot be read must never look like a design with nothing pending.
 */
export async function readPendingDecisions(absPath: string): Promise<PendingDecision[]> {
  return findPendingDecisions(await readFile(absPath, 'utf-8'));
}
