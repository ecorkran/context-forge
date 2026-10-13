/**
 * Console output for the installer. Every line the bash setup-ide printed is
 * reproduced byte for byte, ANSI colors included: the ported snapshot suite pins
 * stdout and stderr.
 *
 * bash printed status lines with `echo -e`, which also interpreted backslash
 * escapes inside messages (file names, patterns). That is not ported: messages
 * are written as plain text.
 */

/** Where the installer writes. The command layer passes process streams; tests capture. */
export interface OutputSink {
  stdout(text: string): void;
  stderr(text: string): void;
}

/** The script's color codes (RED, GREEN, YELLOW, BLUE, NC). */
export const COLOR = {
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
  blue: '\x1b[0;34m',
} as const;

export type Color = keyof typeof COLOR;

const NO_COLOR = '\x1b[0m';

/** `print_status`: a message wrapped in its color, then a newline. */
export function colored(color: Color, message: string): string {
  return `${COLOR[color]}${message}${NO_COLOR}\n`;
}

/**
 * Line-oriented writer over a sink, mirroring the script's three kinds of
 * output: `print_status` lines, `print_status ... >&2` lines, and plain `echo`.
 */
export class Printer {
  constructor(readonly sink: OutputSink) {}

  /** `print_status` to stdout. */
  status(color: Color, message: string): void {
    this.sink.stdout(colored(color, message));
  }

  /** `print_status ... >&2`. */
  statusErr(color: Color, message: string): void {
    this.sink.stderr(colored(color, message));
  }

  /** Plain `echo`: an uncolored stdout line, blank by default. */
  line(text = ''): void {
    this.sink.stdout(text + '\n');
  }

  /** Raw stdout text, already line-terminated (replayed dry-run log lines). */
  raw(text: string): void {
    this.sink.stdout(text);
  }
}

/** A sink that keeps stdout in memory and passes stderr through, as the dry run's log did. */
export class StdoutBuffer implements OutputSink {
  private buffered = '';

  constructor(private readonly passthrough: OutputSink) {}

  stdout(text: string): void {
    this.buffered += text;
  }

  stderr(text: string): void {
    this.passthrough.stderr(text);
  }

  text(): string {
    return this.buffered;
  }
}
