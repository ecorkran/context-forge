/**
 * User-facing error — printed without stack trace.
 * Use for expected failure conditions (missing config, invalid arguments, etc).
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}

/**
 * Top-level error handler. Prints the message and exits with code 1.
 * UserErrors get a clean message; unexpected errors get a brief summary.
 */
export function handleError(err: unknown): never {
  if (err instanceof UserError) {
    console.error(err.message);
  } else if (err instanceof Error) {
    console.error(`Error: ${err.message}`);
  } else {
    console.error(`Error: ${String(err)}`);
  }
  process.exit(1);
}
