import { describe, it, expect, vi, beforeEach } from 'vitest';
import { printJson, printRaw } from '../../src/output/formatter.js';

describe('printJson', () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  it('outputs valid JSON with 2-space indent', () => {
    const data = { key: 'value', nested: { a: 1 } };
    printJson(data);

    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    expect(() => JSON.parse(output)).not.toThrow();
    expect(JSON.parse(output)).toEqual(data);
    expect(output).toContain('  '); // 2-space indent
  });

  it('handles arrays', () => {
    printJson([1, 2, 3]);
    const output = vi.mocked(process.stdout.write).mock.calls[0]?.[0] as string;
    expect(JSON.parse(output)).toEqual([1, 2, 3]);
  });
});

describe('printRaw', () => {
  beforeEach(() => {
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  it('writes text directly to stdout', () => {
    printRaw('hello world');
    expect(process.stdout.write).toHaveBeenCalledWith('hello world');
  });
});
