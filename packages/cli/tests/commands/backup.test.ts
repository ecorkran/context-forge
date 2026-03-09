import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { registerBackupCommand } from '../../src/commands/backup.js';

const mockCreateVersionedBackup = vi.fn();

vi.mock('@context-forge/core/node', () => ({
  getStoragePath: vi.fn(() => '/mock/storage'),
  createVersionedBackup: (...args: unknown[]) => mockCreateVersionedBackup(...args),
}));

function createProgram(): Command {
  const program = new Command();
  program.exitOverride();
  registerBackupCommand(program);
  return program;
}

describe('cf backup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('calls createVersionedBackup for projects.json', async () => {
    mockCreateVersionedBackup.mockResolvedValue(undefined);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'backup']);

    expect(mockCreateVersionedBackup).toHaveBeenCalledWith('/mock/storage', 'projects.json');
  });

  it('prints success message', async () => {
    mockCreateVersionedBackup.mockResolvedValue(undefined);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'backup']);

    const output = vi.mocked(console.log).mock.calls.map((c) => c[0]).join('\n');
    expect(output).toContain('Backup complete');
  });

  it('handles errors gracefully', async () => {
    mockCreateVersionedBackup.mockRejectedValue(new Error('disk full'));
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    const program = createProgram();
    await program.parseAsync(['node', 'cf', 'backup']);

    const errOutput = vi.mocked(console.error).mock.calls.map((c) => c[0]).join('\n');
    expect(errOutput).toContain('disk full');
  });
});
