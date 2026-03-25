/** Standard error codes for machine-readable error responses. */
export type ErrorCode =
  | 'PROJECT_NOT_FOUND'
  | 'FIELD_NOT_FOUND'
  | 'INVALID_ARGUMENT'
  | 'INVALID_VALUE'
  | 'MISSING_CONFIG'
  | 'ARTIFACT_NOT_FOUND'
  | 'READ_ONLY'
  | 'ALREADY_EXISTS';

/**
 * User-facing error — printed without stack trace.
 * Use for expected failure conditions (missing config, invalid arguments, etc).
 */
export class UserError extends Error {
  code?: ErrorCode;
  suggestion?: string;

  constructor(message: string, code?: ErrorCode, suggestion?: string) {
    super(message);
    this.name = 'UserError';
    this.code = code;
    this.suggestion = suggestion;
  }
}

/** Module-level JSON mode flag — set during option parsing. */
let jsonMode = false;

/** Enable JSON-structured error output. Called when --json is parsed. */
export function setJsonMode(): void {
  jsonMode = true;
}

/** Check if JSON mode is active (flag or CF_JSON env var). */
export function isJsonMode(): boolean {
  return jsonMode || process.env.CF_JSON === '1';
}

/**
 * Top-level error handler. Prints the message and exits with code 1.
 * In JSON mode, outputs structured JSON to stderr.
 * Otherwise, UserErrors get a clean message; unexpected errors get a brief summary.
 */
export function handleError(err: unknown): never {
  if (isJsonMode()) {
    const jsonError: Record<string, unknown> = { error: true };
    if (err instanceof UserError) {
      jsonError.code = err.code ?? 'UNKNOWN';
      jsonError.message = err.message;
      if (err.suggestion) jsonError.suggestion = err.suggestion;
    } else if (err instanceof Error) {
      jsonError.code = 'UNKNOWN';
      jsonError.message = err.message;
    } else {
      jsonError.code = 'UNKNOWN';
      jsonError.message = String(err);
    }
    process.stderr.write(JSON.stringify(jsonError) + '\n');
  } else {
    if (err instanceof UserError) {
      const msg = err.suggestion ? `${err.message}\n  ${err.suggestion}` : err.message;
      console.error(msg);
    } else if (err instanceof Error) {
      console.error(`Error: ${err.message}`);
    } else {
      console.error(`Error: ${String(err)}`);
    }
  }
  process.exit(1);
}
