import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import {
  withJsonOption,
  withProjectOption,
  withYesOption,
  withFixOption,
  withAllOption,
  withRawOption,
  withProjectLevelOption,
} from '../src/options.js';

/** Create a fresh Command instance with error-on-unknown-options disabled for isolated tests. */
function makeCmd(): Command {
  const cmd = new Command();
  cmd.exitOverride(); // prevent process.exit in tests
  return cmd;
}

describe('withJsonOption', () => {
  it('registers -j, --json option', () => {
    const cmd = makeCmd();
    withJsonOption(cmd);
    cmd.parse(['-j'], { from: 'user' });
    expect(cmd.opts<{ json?: boolean }>().json).toBe(true);
  });

  it('registers --json long form', () => {
    const cmd = makeCmd();
    withJsonOption(cmd);
    cmd.parse(['--json'], { from: 'user' });
    expect(cmd.opts<{ json?: boolean }>().json).toBe(true);
  });

  it('returns the same Command for chaining', () => {
    const cmd = makeCmd();
    const result = withJsonOption(cmd);
    expect(result).toBe(cmd);
  });
});

describe('withProjectOption', () => {
  it('registers -p, --project <id> option with short flag', () => {
    const cmd = makeCmd();
    withProjectOption(cmd);
    cmd.parse(['-p', 'my-project'], { from: 'user' });
    expect(cmd.opts<{ project?: string }>().project).toBe('my-project');
  });

  it('registers --project long form', () => {
    const cmd = makeCmd();
    withProjectOption(cmd);
    cmd.parse(['--project', 'my-project'], { from: 'user' });
    expect(cmd.opts<{ project?: string }>().project).toBe('my-project');
  });

  it('returns the same Command for chaining', () => {
    const cmd = makeCmd();
    const result = withProjectOption(cmd);
    expect(result).toBe(cmd);
  });
});

describe('withYesOption', () => {
  it('registers -y, --yes option', () => {
    const cmd = makeCmd();
    withYesOption(cmd);
    cmd.parse(['-y'], { from: 'user' });
    expect(cmd.opts<{ yes?: boolean }>().yes).toBe(true);
  });

  it('registers --yes long form', () => {
    const cmd = makeCmd();
    withYesOption(cmd);
    cmd.parse(['--yes'], { from: 'user' });
    expect(cmd.opts<{ yes?: boolean }>().yes).toBe(true);
  });

  it('returns the same Command for chaining', () => {
    const cmd = makeCmd();
    const result = withYesOption(cmd);
    expect(result).toBe(cmd);
  });
});

describe('withFixOption', () => {
  it('registers -f, --fix option', () => {
    const cmd = makeCmd();
    withFixOption(cmd);
    cmd.parse(['-f'], { from: 'user' });
    expect(cmd.opts<{ fix?: boolean }>().fix).toBe(true);
  });

  it('registers --fix long form', () => {
    const cmd = makeCmd();
    withFixOption(cmd);
    cmd.parse(['--fix'], { from: 'user' });
    expect(cmd.opts<{ fix?: boolean }>().fix).toBe(true);
  });

  it('returns the same Command for chaining', () => {
    const cmd = makeCmd();
    const result = withFixOption(cmd);
    expect(result).toBe(cmd);
  });
});

describe('withAllOption', () => {
  it('registers -a, --all option', () => {
    const cmd = makeCmd();
    withAllOption(cmd);
    cmd.parse(['-a'], { from: 'user' });
    expect(cmd.opts<{ all?: boolean }>().all).toBe(true);
  });

  it('registers --all long form', () => {
    const cmd = makeCmd();
    withAllOption(cmd);
    cmd.parse(['--all'], { from: 'user' });
    expect(cmd.opts<{ all?: boolean }>().all).toBe(true);
  });

  it('returns the same Command for chaining', () => {
    const cmd = makeCmd();
    const result = withAllOption(cmd);
    expect(result).toBe(cmd);
  });
});

describe('withRawOption', () => {
  it('registers -r, --raw option', () => {
    const cmd = makeCmd();
    withRawOption(cmd);
    cmd.parse(['-r'], { from: 'user' });
    expect(cmd.opts<{ raw?: boolean }>().raw).toBe(true);
  });

  it('registers --raw long form', () => {
    const cmd = makeCmd();
    withRawOption(cmd);
    cmd.parse(['--raw'], { from: 'user' });
    expect(cmd.opts<{ raw?: boolean }>().raw).toBe(true);
  });

  it('returns the same Command for chaining', () => {
    const cmd = makeCmd();
    const result = withRawOption(cmd);
    expect(result).toBe(cmd);
  });
});

describe('withProjectLevelOption', () => {
  it('registers --project-level option (no short flag)', () => {
    const cmd = makeCmd();
    withProjectLevelOption(cmd);
    cmd.parse(['--project-level'], { from: 'user' });
    expect(cmd.opts<{ projectLevel?: boolean }>().projectLevel).toBe(true);
  });

  it('has no short flag registered', () => {
    const cmd = makeCmd();
    withProjectLevelOption(cmd);
    const optionNames = cmd.options.flatMap((o) => o.flags.split(',').map((f) => f.trim()));
    const shortFlags = optionNames.filter((f) => /^-[a-z]$/.test(f));
    expect(shortFlags).toHaveLength(0);
  });

  it('returns the same Command for chaining', () => {
    const cmd = makeCmd();
    const result = withProjectLevelOption(cmd);
    expect(result).toBe(cmd);
  });
});

describe('composable chaining', () => {
  it('can chain multiple helpers on one command', () => {
    const cmd = makeCmd();
    withProjectOption(withJsonOption(cmd));
    cmd.parse(['-j', '-p', 'test-project'], { from: 'user' });
    const opts = cmd.opts<{ json?: boolean; project?: string }>();
    expect(opts.json).toBe(true);
    expect(opts.project).toBe('test-project');
  });
});
