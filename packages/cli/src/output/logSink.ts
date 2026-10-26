/**
 * Where a command's progress lines go. `cf init --json` keeps stdout pure JSON by passing
 * STDERR_SINK to every step (slice 271 D8); everything else uses the default STDOUT_SINK.
 */
export type LogSink = (line: string) => void;

export const STDOUT_SINK: LogSink = (line) => {
  console.log(line);
};

export const STDERR_SINK: LogSink = (line) => {
  process.stderr.write(`${line}\n`);
};
