import { describe, it, expect, afterEach, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { askConfirmation } from '../../src/utils/confirm.js';

describe('askConfirmation()', () => {
  const realStdin = Object.getOwnPropertyDescriptor(process, 'stdin');

  /** Replace process.stdin with a stream the test controls. */
  function fakeStdin(): PassThrough {
    const input = new PassThrough();
    Object.defineProperty(process, 'stdin', { value: input, configurable: true });
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    return input;
  }

  afterEach(() => {
    if (realStdin) Object.defineProperty(process, 'stdin', realStdin);
    vi.restoreAllMocks();
  });

  it('resolves true for y', async () => {
    const input = fakeStdin();
    const answer = askConfirmation('Continue? (y/N) ');
    input.write('y\n');

    expect(await answer).toBe(true);
  });

  it('resolves false for anything else', async () => {
    const input = fakeStdin();
    const answer = askConfirmation('Continue? (y/N) ');
    input.write('n\n');

    expect(await answer).toBe(false);
  });

  it('resolves false at EOF instead of hanging or proceeding', async () => {
    const input = fakeStdin();
    const answer = askConfirmation('Continue? (y/N) ');
    input.end();

    expect(await answer).toBe(false);
  });
});
