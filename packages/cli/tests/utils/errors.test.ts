import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

  it('accepts optional error code', () => {
    const err = new UserError('not found', 'PROJECT_NOT_FOUND');
    expect(err.code).toBe('PROJECT_NOT_FOUND');
  });

  it('accepts optional suggestion', () => {
    const err = new UserError('bad input', 'INVALID_ARGUMENT', 'Try a number');
    expect(err.suggestion).toBe('Try a number');
  });

  it('code and suggestion are undefined when not provided', () => {
    const err = new UserError('simple error');
    expect(err.code).toBeUndefined();
    expect(err.suggestion).toBeUndefined();
  });
});

describe('handleError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    delete process.env.CF_JSON;
    vi.restoreAllMocks();
  });

  describe('plain text mode', () => {
    it('prints UserError message without prefix', () => {
      handleError(new UserError('missing project'));
      expect(console.error).toHaveBeenCalledWith('missing project');
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('appends suggestion to plain text UserError message', () => {
      handleError(new UserError('bad field', 'FIELD_NOT_FOUND', 'Run cf --help'));
      expect(console.error).toHaveBeenCalledWith('bad field\n  Run cf --help');
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

  describe('JSON mode (CF_JSON=1)', () => {
    let stderrData: string;

    beforeEach(() => {
      stderrData = '';
      process.env.CF_JSON = '1';
      vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
        stderrData += String(chunk);
        return true;
      });
    });

    it('outputs structured JSON for UserError with code', () => {
      handleError(new UserError('bad arg', 'INVALID_ARGUMENT', 'Use a number'));
      const parsed = JSON.parse(stderrData.trim());
      expect(parsed.error).toBe(true);
      expect(parsed.code).toBe('INVALID_ARGUMENT');
      expect(parsed.message).toBe('bad arg');
      expect(parsed.suggestion).toBe('Use a number');
    });

    it('outputs code UNKNOWN for UserError without code', () => {
      handleError(new UserError('generic error'));
      const parsed = JSON.parse(stderrData.trim());
      expect(parsed.code).toBe('UNKNOWN');
    });

    it('outputs structured JSON for generic Error', () => {
      handleError(new Error('crash'));
      const parsed = JSON.parse(stderrData.trim());
      expect(parsed.error).toBe(true);
      expect(parsed.code).toBe('UNKNOWN');
      expect(parsed.message).toBe('crash');
    });

    it('omits suggestion when not provided', () => {
      handleError(new UserError('missing', 'MISSING_CONFIG'));
      const parsed = JSON.parse(stderrData.trim());
      expect(parsed).not.toHaveProperty('suggestion');
    });
  });
});
