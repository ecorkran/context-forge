import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerCheckCommand } from '../../src/commands/check.js';

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerCheckCommand(program);
  return program;
}

describe('cf check', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('prints stub message about slice 166 dependency', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check']);

    const output = vi.mocked(console.log).mock.calls[0]?.[0] as string;
    expect(output).toContain('slice 166');
    expect(output).toContain('not yet available');
  });

  it('exits cleanly (no error)', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'check']);

    expect(exitSpy).not.toHaveBeenCalled();
  });
});
