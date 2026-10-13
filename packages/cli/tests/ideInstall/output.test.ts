import { describe, expect, it } from 'vitest';
import { Printer, StdoutBuffer, type OutputSink } from '../../src/ideInstall/output.js';

function capture(): { sink: OutputSink; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return { sink: { stdout: (t) => out.push(t), stderr: (t) => err.push(t) }, out, err };
}

describe('Printer', () => {
  it('wraps a status line in its color and the reset code', () => {
    const { sink, out } = capture();
    new Printer(sink).status('green', '✅ done');
    expect(out).toEqual(['\x1b[0;32m✅ done\x1b[0m\n']);
  });

  it('uses the script color codes', () => {
    const { sink, out } = capture();
    const printer = new Printer(sink);
    printer.status('red', 'r');
    printer.status('yellow', 'y');
    printer.status('blue', 'b');
    expect(out).toEqual(['\x1b[0;31mr\x1b[0m\n', '\x1b[1;33my\x1b[0m\n', '\x1b[0;34mb\x1b[0m\n']);
  });

  it('sends statusErr to stderr only', () => {
    const { sink, out, err } = capture();
    new Printer(sink).statusErr('yellow', '⚠️  warning');
    expect(out).toEqual([]);
    expect(err).toEqual(['\x1b[1;33m⚠️  warning\x1b[0m\n']);
  });

  it('writes plain echo lines uncolored, blank by default', () => {
    const { sink, out } = capture();
    const printer = new Printer(sink);
    printer.line('   • note');
    printer.line();
    expect(out).toEqual(['   • note\n', '\n']);
  });

  it('does not interpret backslash escapes the way echo -e did', () => {
    const { sink, out } = capture();
    new Printer(sink).status('blue', 'a\\tb');
    expect(out[0]).toContain('a\\tb');
  });
});

describe('StdoutBuffer', () => {
  it('buffers stdout and passes stderr through', () => {
    const { sink, out, err } = capture();
    const buffer = new StdoutBuffer(sink);
    buffer.stdout('kept\n');
    buffer.stderr('now\n');
    expect(buffer.text()).toBe('kept\n');
    expect(out).toEqual([]);
    expect(err).toEqual(['now\n']);
  });
});
