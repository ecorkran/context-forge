import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { buildCommandCatalog, type CommandCatalog } from '../../src/utils/commandCatalog.js';

describe('cf help --json', () => {
  let catalog: CommandCatalog;

  beforeEach(() => {
    // Build a minimal program with representative commands
    const program = new Command();
    program.name('cf').version('1.2.3');

    program
      .command('build')
      .description('Generate a context prompt')
      .option('--project <id>', 'Project ID')
      .option('--json', 'Output as JSON');

    const list = program.command('list').description('List project artifacts');
    list.command('projects').description('List all projects').option('--json', 'Output as JSON');
    list.command('slices').description('List slices').option('--all', 'Show all');

    program
      .command('slice <index>')
      .description('Set active slice and build prompt')
      .option('--project <name|id>', 'Project name or ID');

    program
      .command('concept')
      .description('Set phase to Concept and build prompt');

    catalog = buildCommandCatalog(program, '1.2.3');
  });

  it('returns valid catalog with version', () => {
    expect(catalog.version).toBe('1.2.3');
    expect(Array.isArray(catalog.commands)).toBe(true);
  });

  it('commands array is non-empty', () => {
    expect(catalog.commands.length).toBeGreaterThan(0);
  });

  it('build command has expected structure', () => {
    const build = catalog.commands.find(c => c.name === 'build');
    expect(build).toBeDefined();
    expect(build!.description).toBe('Generate a context prompt');
    expect(build!.options.length).toBeGreaterThan(0);
    expect(build!.options.find(o => o.flag.includes('--project'))).toBeDefined();
    expect(build!.subcommands).toEqual([]);
    expect(build!.args).toEqual([]);
  });

  it('list command has subcommands', () => {
    const list = catalog.commands.find(c => c.name === 'list');
    expect(list).toBeDefined();
    expect(list!.subcommands.length).toBe(2);
    expect(list!.subcommands.map(s => s.name)).toContain('projects');
    expect(list!.subcommands.map(s => s.name)).toContain('slices');
  });

  it('slice command has required arg', () => {
    const slice = catalog.commands.find(c => c.name === 'slice');
    expect(slice).toBeDefined();
    expect(slice!.args.length).toBe(1);
    expect(slice!.args[0].name).toBe('index');
    expect(slice!.args[0].required).toBe(true);
  });

  it('filters out help and version options', () => {
    for (const cmd of catalog.commands) {
      for (const opt of cmd.options) {
        expect(opt.flag).not.toContain('--help');
        expect(opt.flag).not.toContain('--version');
      }
    }
  });

  it('filters out help subcommand', () => {
    for (const cmd of catalog.commands) {
      expect(cmd.subcommands.find(s => s.name === 'help')).toBeUndefined();
    }
    expect(catalog.commands.find(c => c.name === 'help')).toBeUndefined();
  });
});
