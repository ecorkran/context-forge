/**
 * Console output for the installer. Every line the bash setup-ide printed is
 * reproduced byte for byte, ANSI colors included: the ported snapshot suite pins
 * stdout and stderr.
 */

/** Where the installer writes. The command layer passes process streams; tests capture. */
export interface OutputSink {
  stdout(text: string): void;
  stderr(text: string): void;
}
