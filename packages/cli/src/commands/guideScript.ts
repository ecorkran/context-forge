import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import type { ProjectData } from '@context-forge/core';
import { propagationTargets } from './worktreePropagation.js';

/**
 * Features of the guide's setup-ide script that cf uses. Each value is a word
 * in `setup-ide --capabilities` output and, prefixed with `--`, the flag itself.
 */
export const GuideCapability = {
  DryRun: 'dry-run',
  WriteLint: 'write-lint',
  Root: 'root',
} as const;

export type GuideCapabilityValue = (typeof GuideCapability)[keyof typeof GuideCapability];

export function capabilityFlag(capability: GuideCapabilityValue): string {
  return `--${capability}`;
}

/** A failed child process from execFileSync carries its exit status. */
function isProcessExit(err: unknown): err is Error & { status: number | null } {
  return err instanceof Error && 'status' in err;
}

/**
 * The words `setup-ide --capabilities` prints, or null for a guide older than
 * v0.20.1. An older script takes `--capabilities` as its target, rejects it as
 * unsupported, and exits non-zero without writing anything.
 */
export function readCapabilities(scriptPath: string, cwd: string): Set<string> | null {
  try {
    const out = execFileSync('bash', [scriptPath, '--capabilities'], {
      cwd,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return new Set(out.trim().split(/\s+/).filter(Boolean));
  } catch (err) {
    if (isProcessExit(err)) return null;
    throw err;
  }
}

/**
 * Whether the guide script handles a feature. A guide that reports capabilities
 * is taken at its word. An older one is checked by searching the script for the
 * flag: guides up to v0.19.4 read only $1 and would silently ignore it. `root`
 * is never inferred from the text; it is trusted only when reported.
 */
export function guideSupports(
  scriptPath: string,
  capabilities: ReadonlySet<string> | null,
  capability: GuideCapabilityValue,
): boolean {
  if (capabilities) return capabilities.has(capability);
  if (capability === GuideCapability.Root) return false;
  return fs.readFileSync(scriptPath, 'utf-8').includes(capabilityFlag(capability));
}

/**
 * Run the main checkout's setup-ide script once per registered worktree with
 * `--root <worktree>`, so each worktree is installed, pruned, and backed up by
 * the guide itself from the main checkout's guide files. A failing worktree
 * does not stop the others. Returns the names of the worktrees that failed.
 */
export function runSetupIdeInWorktrees(
  project: ProjectData,
  scriptPath: string,
  target: string,
  flags: readonly string[],
): string[] {
  const failed: string[] = [];
  for (const wt of propagationTargets(project)) {
    const wtPath = wt.worktreePath!;
    const name = wt.name ?? wt.id;
    console.log(`  → setup-ide in worktree: ${name} (${wtPath})`);
    try {
      execFileSync('bash', [scriptPath, target, capabilityFlag(GuideCapability.Root), wtPath, ...flags], {
        cwd: wtPath,
        stdio: 'inherit',
      });
    } catch (err) {
      if (!isProcessExit(err)) throw err;
      console.error(`  setup-ide exited with code ${err.status ?? 'unknown'} in worktree ${name}.`);
      failed.push(name);
    }
  }
  return failed;
}
