import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Command } from 'commander';
import { handleError } from '../utils/errors.js';
import { withJsonOption, withYesOption } from '../options.js';
import { askConfirmation } from '../utils/confirm.js';
import { printJson } from '../output/formatter.js';
import { label, value, dim, success, warn } from '../output/styles.js';

const require = createRequire(import.meta.url);
const { version: currentVersion } = require('../../package.json') as { version: string };

/**
 * Compare two semver strings (major.minor.patch).
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 */
export function compareSemver(a: string, b: string): number {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const segA = partsA[i] ?? 0;
    const segB = partsB[i] ?? 0;
    if (segA < segB) return -1;
    if (segA > segB) return 1;
  }
  return 0;
}

/**
 * Fetch the latest published version of a package from the npm registry.
 * Returns null on any failure (network, non-200, malformed JSON).
 */
export async function fetchLatestVersion(packageName: string): Promise<string | null> {
  try {
    const response = await globalThis.fetch(
      `https://registry.npmjs.org/${packageName}/latest`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (typeof data === 'object' && data !== null && 'version' in data) {
      const ver = (data as { version: unknown }).version;
      if (typeof ver === 'string') return ver;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Detect how cf was installed globally.
 * Returns the package manager method and whether this is a local/dev install.
 */
export function detectInstallMethod(): { method: 'npm' | 'pnpm' | 'unknown'; isLocal: boolean } {
  const scriptPath = process.argv[1] ?? '';

  // pnpm global install (check first — pnpm global paths also contain node_modules)
  if (scriptPath.includes('.pnpm') || scriptPath.includes('pnpm/global')) {
    return { method: 'pnpm', isLocal: false };
  }

  // Check for global npm install (system-level node_modules)
  const isGlobalNpm = /\/(usr|opt)\/(local\/)?lib\/node_modules\//.test(scriptPath)
    || /\/lib\/node_modules\//.test(scriptPath);
  if (isGlobalNpm) {
    return { method: 'npm', isLocal: false };
  }

  // Local/dev install: project-local node_modules or relative path
  if (scriptPath.includes('node_modules') || !scriptPath.startsWith('/')) {
    return { method: 'unknown', isLocal: true };
  }

  // Heuristic: if a package.json exists in the script's ancestor directories
  // (within 4 levels), this is likely a local dev install (e.g., `node packages/cli/dist/index.js`)
  if (isLocalDevPath(scriptPath)) {
    return { method: 'unknown', isLocal: true };
  }

  // Default to npm global (absolute path not matching known patterns)
  return { method: 'npm', isLocal: false };
}

/** Check if the script path is under a local project by looking for package.json nearby. */
function isLocalDevPath(scriptPath: string): boolean {
  let dir = dirname(resolve(scriptPath));
  for (let i = 0; i < 4; i++) {
    if (existsSync(join(dir, 'package.json'))) return true;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return false;
}

/**
 * Run the global install command to update the CLI package.
 * Uses execSync so the user sees output directly. Throws on failure.
 */
export function runUpdate(method: 'npm' | 'pnpm'): void {
  const cmd = method === 'pnpm'
    ? 'pnpm add -g @context-forge/cli@latest'
    : 'npm install -g @context-forge/cli@latest';
  execSync(cmd, { stdio: 'inherit' });
}

/** Register the `cf update` command. */
export function registerUpdateCommand(program: Command): void {
  const updateCmd = program
    .command('update')
    .description('Check for updates and install the latest version');
  withYesOption(updateCmd);
  withJsonOption(updateCmd);
  updateCmd.action(async (opts: { yes?: boolean; json?: boolean }) => {
      try {
        const install = detectInstallMethod();

        // Local/dev install — skip update
        if (install.isLocal) {
          console.log(warn('Local development install detected — skipping self-update.'));
          console.log(dim('  To update, pull the latest changes and rebuild.'));
          return;
        }

        // Fetch latest version from npm
        const latest = await fetchLatestVersion('@context-forge/cli');
        if (!latest) {
          handleError(new Error('Could not reach npm registry — check your network connection.'));
        }

        const cmp = compareSemver(currentVersion, latest);

        // JSON output — no side effects
        if (opts.json) {
          printJson({
            current: currentVersion,
            latest,
            updateAvailable: cmp < 0,
            installMethod: install.method,
          });
          return;
        }

        // Already up to date
        if (cmp >= 0) {
          console.log(success(`@context-forge/cli v${currentVersion} is up to date.`));
          return;
        }

        // Update available
        console.log(`${label('Update available:')} ${value(currentVersion)} → ${value(latest)}`);
        console.log('');

        const isTTY = process.stdin.isTTY;

        if (opts.yes) {
          // --yes: proceed without prompt
        } else if (isTTY) {
          // Interactive: prompt
          const confirmed = await askConfirmation('Install now? (y/N) ');
          if (!confirmed) {
            console.log(dim('Update skipped.'));
            return;
          }
        } else {
          // Non-TTY without --yes: inform and exit
          console.log(dim('Run with --yes to install non-interactively.'));
          return;
        }

        if (install.method === 'unknown') {
          console.log(warn('Could not determine install method. Run manually:'));
          console.log(dim('  npm install -g @context-forge/cli@latest'));
          return;
        }

        runUpdate(install.method);
        console.log('');
        console.log(success(`✓ Updated @context-forge/cli to ${latest}`));
      } catch (err) {
        handleError(err);
      }
    });
}
