import { resolve } from 'node:path';
import { Command } from 'commander';
import {
  DetectionError,
  REPORT_VERSION,
  detectProject,
  serializeDetectionReport,
  serializeErrorEnvelope,
  toDetectionReport,
} from '@context-forge/core/node';
import { handleError } from '../utils/errors.js';
import { withJsonOption } from '../options.js';
import { label, value as valueStyle, dim } from '../output/styles.js';

interface DetectOptions {
  path?: string;
  json?: boolean;
}

/** D5: a failure is one envelope on stdout and exit 1. `internal` is applied here, at the process boundary. */
function writeJsonFailure(error: unknown): void {
  const envelope =
    error instanceof DetectionError
      ? serializeErrorEnvelope(REPORT_VERSION, error.code, error.message)
      : serializeErrorEnvelope(REPORT_VERSION, 'internal', error instanceof Error ? error.message : String(error));
  process.stdout.write(envelope + '\n');
  process.exitCode = 1;
}

export async function detectAction(opts: DetectOptions): Promise<void> {
  // Works unregistered (D1): the directory is judged as given, never looked up in the project store.
  const root = resolve(opts.path ?? process.cwd());
  try {
    const detection = await detectProject(root);
    if (opts.json) {
      process.stdout.write(serializeDetectionReport(toDetectionReport(detection)) + '\n');
      return;
    }
    console.log(label('Outcome: ') + valueStyle(detection.outcome.kind));
    for (const notice of detection.notices) console.log(dim(notice));
  } catch (error) {
    // Never handleError in JSON mode: it writes a different shape to stderr.
    if (opts.json) {
      writeJsonFailure(error);
      return;
    }
    handleError(error);
  }
}

export function registerDetectCommand(program: Command): void {
  const detectCmd = program
    .command('detect')
    .description('Report what is in a directory and whether it needs adoption (works on unregistered projects)')
    .option('--path <dir>', 'Directory to judge (default: current directory)');
  withJsonOption(detectCmd);
  detectCmd.action(detectAction);
}
