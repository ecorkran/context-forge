import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserError, handleError } from '../../src/utils/errors.js';

describe('UserError', () => {
  it('has the correct name', () => {
    const err = new UserError('test message');
    expect(err.name).toBe('UserError');
    expect(err.message).toBe('test message');
  });

  it('is an instanceof Error', () => {
    const err = new UserError('test');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('handleError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('prints UserError message without prefix', () => {
    handleError(new UserError('missing project'));
    expect(console.error).toHaveBeenCalledWith('missing project');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('prints generic Error with "Error:" prefix', () => {
    handleError(new Error('something broke'));
    expect(console.error).toHaveBeenCalledWith('Error: something broke');
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('handles non-Error values', () => {
    handleError('string error');
    expect(console.error).toHaveBeenCalledWith('Error: string error');
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
