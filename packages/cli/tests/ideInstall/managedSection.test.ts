import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { managedState, writeManagedSection } from '../../src/ideInstall/managedSection.js';
import { Printer } from '../../src/ideInstall/output.js';
import { makeTmpDir } from './harness.js';

// Repeated on purpose: the markers are a contract with files in users' projects.
const BEGIN = '<!-- BEGIN:context-forge -->';
const END = '<!-- END:context-forge -->';
const LEGACY = '[//]: # (context-forge:managed)';
const LEGACY_END = '[//]: # (context-forge:managed end)';
const CONTENT = '# Project Guidelines\n\nnew rules\n';

let tmp: string;
let file: string;
let stdout: string;
let printer: Printer;

beforeEach(() => {
  tmp = makeTmpDir();
  file = path.join(tmp, 'AGENTS.md');
  stdout = '';
  printer = new Printer({ stdout: (t) => (stdout += t), stderr: () => {} });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const write = (text: string | Buffer): void => fs.writeFileSync(file, text);
const read = (): string => fs.readFileSync(file, 'utf-8');
const merge = (): boolean => writeManagedSection(file, CONTENT, 'AGENTS.md', printer);
const backup = (): string => file + '.pre-context-forge';

describe('managedState', () => {
  it('classifies each state', () => {
    expect(managedState(file)).toBe('absent');
    write('plain\n');
    expect(managedState(file)).toBe('unmanaged');
    write(`top\n${LEGACY}\nold\n`);
    expect(managedState(file)).toBe('legacy');
    write(`${BEGIN}\nx\n${END}\n`);
    expect(managedState(file)).toBe('managed');
  });

  it('is broken for duplicates, a lone marker, or END before BEGIN', () => {
    for (const text of [`${BEGIN}\n${BEGIN}\n${END}\n`, `${BEGIN}\n`, `${END}\nx\n${BEGIN}\n`]) {
      write(text);
      expect(managedState(file)).toBe('broken');
    }
  });

  it('matches whole lines only', () => {
    write(`  ${BEGIN}\n${END}\r\n`);
    expect(managedState(file)).toBe('unmanaged');
  });
});

describe('writeManagedSection', () => {
  it('writes a bare block for an absent file', () => {
    expect(merge()).toBe(true);
    expect(read()).toBe(`${BEGIN}\n${CONTENT}${END}\n`);
    expect(fs.existsSync(backup())).toBe(false);
  });

  it('appends to an unmanaged file after a forced newline, with a one-time backup', () => {
    write('mine');
    merge();
    expect(read()).toBe(`mine\n${BEGIN}\n${CONTENT}${END}\n`);
    expect(fs.readFileSync(backup(), 'utf-8')).toBe('mine');
    expect(stdout).toContain('📎 Preserved existing AGENTS.md; appended managed block');
  });

  it('takes no second backup once the file has markers', () => {
    write('mine\n');
    merge();
    fs.writeFileSync(backup(), 'first backup\n');
    stdout = '';
    merge();
    expect(fs.readFileSync(backup(), 'utf-8')).toBe('first backup\n');
    expect(stdout).not.toContain('Backed up');
  });

  it('replaces only the block, keeping CR and outside bytes; pins #38 final newline', () => {
    write(Buffer.from(`above\r\n${BEGIN}\nstale\n${END}\nbelow, no newline`));
    merge();
    expect(read()).toBe(`above\r\n${BEGIN}\n${CONTENT}${END}\nbelow, no newline\n`);
  });

  it('passes bytes that are not valid UTF-8 through untouched', () => {
    const outside = Buffer.from([0xff, 0xfe, 0x0a]);
    write(Buffer.concat([outside, Buffer.from(`${BEGIN}\nold\n${END}\n`)]));
    merge();
    expect(fs.readFileSync(file).subarray(0, 3).equals(outside)).toBe(true);
  });

  it('migrates legacy, dropping a re-emitted H1 and the blank line after it', () => {
    write(`# Project Guidelines\n\nintro\n\n${LEGACY}\nold generated\n`);
    merge();
    expect(read()).toBe(`intro\n\n${BEGIN}\n${CONTENT}${END}\n`);
    expect(stdout).toContain('🔄 Migrated AGENTS.md to BEGIN/END markers');
    expect(stdout).toContain('Content below the old marker was generated and has been replaced.');
    expect(fs.existsSync(backup())).toBe(true);
  });

  it('keeps a first line that is not the re-emitted H1', () => {
    write(`# My Title\n\n${LEGACY}\nold\n`);
    merge();
    expect(read()).toBe(`# My Title\n\n${BEGIN}\n${CONTENT}${END}\n`);
  });

  it('keeps content after a hand-added legacy end marker (#33)', () => {
    write(`intro\n${LEGACY}\nold\n${LEGACY_END}\ntail\n${LEGACY}\nmore tail\n`);
    merge();
    expect(read()).toBe(`intro\n${BEGIN}\n${CONTENT}${END}\ntail\nmore tail\n`);
    expect(stdout).toContain('content after the end marker was kept.');
  });

  it('leaves a file with broken markers unchanged and reports it', () => {
    const broken = `top\n${END}\nmiddle\n${BEGIN}\n`;
    write(broken);
    expect(merge()).toBe(false);
    expect(read()).toBe(broken);
    expect(stdout).toContain('❌ AGENTS.md has unbalanced context-forge markers');
    expect(fs.readdirSync(tmp)).toEqual(['AGENTS.md']);
  });
});
