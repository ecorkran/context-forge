// decideConfigCommit against real temp git repositories (no mocks).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { decideConfigCommit, CONFIG_LEFT_OUT_NOTICE } from '../../src/guides/configExcludeCommit.js';
import { makeTempDir } from './helpers/guideArchiveFixture.js';
import { git, initRepo } from './helpers/gitRepoFixture.js';

const CONFIG_FILE = '.context-forge.toml';

describe('decideConfigCommit()', () => {
  let repo: string;

  const baseConfig = '[guide]\ngit_strategy = "tarball"\n';

  function writeConfig(content: string): void {
    writeFileSync(join(repo, CONFIG_FILE), content);
  }

  function commitConfig(content: string): void {
    writeConfig(content);
    git(repo, 'add', CONFIG_FILE);
    git(repo, 'commit', '-q', '-m', 'config');
  }

  beforeEach(() => {
    repo = makeTempDir('cf-config-commit-');
    initRepo(repo, true);
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('adds the file when guide.exclude is the only change against HEAD', async () => {
    commitConfig(baseConfig);
    writeConfig(`${baseConfig}exclude = "tool-guides"\n`);

    expect(await decideConfigCommit(repo)).toEqual({ add: true, relativePath: CONFIG_FILE });
  });

  it('adds the file when guide.exclude is the only change and the whole table is new', async () => {
    commitConfig('[other]\nkey = 1\n');
    writeConfig('[other]\nkey = 1\n\n[guide]\nexclude = "tool-guides"\n');

    expect(await decideConfigCommit(repo)).toEqual({ add: true, relativePath: CONFIG_FILE });
  });

  it('leaves the file out with a notice when other keys changed too', async () => {
    commitConfig(baseConfig);
    writeConfig(`${baseConfig}exclude = "tool-guides"\n\n[other]\nkey = 1\n`);

    expect(await decideConfigCommit(repo)).toEqual({ add: false, notice: CONFIG_LEFT_OUT_NOTICE });
  });

  it('leaves the file out with a notice when only another key changed', async () => {
    commitConfig(baseConfig);
    writeConfig('[guide]\ngit_strategy = "clone"\n');

    expect(await decideConfigCommit(repo)).toEqual({ add: false, notice: CONFIG_LEFT_OUT_NOTICE });
  });

  it('does not add an unmodified file and says nothing', async () => {
    commitConfig(`${baseConfig}exclude = "tool-guides"\n`);

    expect(await decideConfigCommit(repo)).toEqual({ add: false });
  });

  it('adds a new file whose only key is guide.exclude', async () => {
    writeConfig('[guide]\nexclude = "tool-guides"\n');

    expect(await decideConfigCommit(repo)).toEqual({ add: true, relativePath: CONFIG_FILE });
  });

  it('leaves out a new file that has other keys', async () => {
    writeConfig('[guide]\nexclude = "tool-guides"\ngit_strategy = "tarball"\n');

    expect(await decideConfigCommit(repo)).toEqual({ add: false, notice: CONFIG_LEFT_OUT_NOTICE });
  });

  it('adds a new file in a repository with no commits when guide.exclude is its only key', async () => {
    const fresh = makeTempDir('cf-config-commit-fresh-');
    try {
      initRepo(fresh, false);
      writeFileSync(join(fresh, CONFIG_FILE), '[guide]\nexclude = "tool-guides"\n');

      expect(await decideConfigCommit(fresh)).toEqual({ add: true, relativePath: CONFIG_FILE });
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  });

  it('adds nothing when there is no config file', async () => {
    expect(await decideConfigCommit(repo)).toEqual({ add: false });
  });

  it('adds nothing outside a git repository', async () => {
    const plain = makeTempDir('cf-config-commit-plain-');
    try {
      writeFileSync(join(plain, CONFIG_FILE), '[guide]\nexclude = "tool-guides"\n');

      expect(await decideConfigCommit(plain)).toEqual({ add: false });
    } finally {
      rmSync(plain, { recursive: true, force: true });
    }
  });
});
