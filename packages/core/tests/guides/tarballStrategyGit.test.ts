// TarballStrategy.update committing guide.exclude changes, against a real git repository.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { TarballStrategy } from '../../src/guides/strategies/TarballStrategy.js';
import { CONFIG_LEFT_OUT_NOTICE } from '../../src/guides/configExcludeCommit.js';
import { GUIDE_RELATIVE_PATH } from '../../src/guides/types.js';
import { buildGuideArchive, makeTempDir } from './helpers/guideArchiveFixture.js';
import { git, initRepo } from './helpers/gitRepoFixture.js';

const CONFIG_FILE = '.context-forge.toml';
const BASE_CONFIG = '[guide]\ngit_strategy = "tarball"\n';
const EXCLUDE = 'project-guides/lint/csharp';

describe('TarballStrategy guide.exclude commit (D3)', () => {
  let project: string;
  let archiveDir: string;
  let archive: string;
  let targetDir: string;

  function committedFiles(): string[] {
    return git(project, 'show', '--name-only', '--format=', 'HEAD').split('\n').filter(Boolean);
  }

  /** Guide installed and the base config committed; returns a strategy that now excludes csharp lint. */
  async function installThenConfigureExclude(): Promise<TarballStrategy> {
    await new TarballStrategy().install(project, archive, targetDir);
    writeFileSync(join(project, CONFIG_FILE), BASE_CONFIG);
    git(project, 'add', CONFIG_FILE);
    git(project, 'commit', '-q', '-m', 'config');
    return new TarballStrategy([EXCLUDE]);
  }

  beforeEach(async () => {
    project = makeTempDir('cf-tarball-git-project-');
    archiveDir = makeTempDir('cf-tarball-git-archive-');
    initRepo(project, true);
    mkdirSync(join(project, 'project-documents'), { recursive: true });
    targetDir = join(project, GUIDE_RELATIVE_PATH);
    archive = await buildGuideArchive({ dir: archiveDir });
  });

  afterEach(() => {
    rmSync(project, { recursive: true, force: true });
    rmSync(archiveDir, { recursive: true, force: true });
  });

  it('commits the guide change and .context-forge.toml together, leaving a clean tree', async () => {
    const strategy = await installThenConfigureExclude();
    writeFileSync(join(project, CONFIG_FILE), `${BASE_CONFIG}exclude = "${EXCLUDE}"\n`);

    const result = await strategy.update(project, targetDir, archive);

    expect(result.excludeChanged).toBe(true);
    expect(result.configCommitted).toBe(true);
    expect(result.configNotice).toBeUndefined();
    expect(committedFiles()).toContain(CONFIG_FILE);
    expect(committedFiles()).toContain(`${GUIDE_RELATIVE_PATH}/project-guides/lint/csharp/a.txt`);
    expect(git(project, 'status', '--porcelain')).toBe('');
  });

  it('leaves the config out with a notice when it has other edits, and sweeps nothing else in', async () => {
    const strategy = await installThenConfigureExclude();
    writeFileSync(join(project, CONFIG_FILE), `${BASE_CONFIG}exclude = "${EXCLUDE}"\n\n[other]\nkey = 1\n`);
    writeFileSync(join(project, 'notes.txt'), 'staged by the user\n');
    git(project, 'add', 'notes.txt');

    const result = await strategy.update(project, targetDir, archive);

    expect(result.configCommitted).toBe(false);
    expect(result.configNotice).toBe(CONFIG_LEFT_OUT_NOTICE);
    expect(committedFiles()).not.toContain(CONFIG_FILE);
    expect(committedFiles()).not.toContain('notes.txt');
    expect(committedFiles()).toContain(`${GUIDE_RELATIVE_PATH}/project-guides/lint/csharp/a.txt`);
    // The config edit and the user's staged file are still pending, untouched.
    const status = git(project, 'status', '--porcelain');
    expect(status).toContain(CONFIG_FILE);
    expect(status).toMatch(/^A\s+notes\.txt$/m);
  });

  it('reports configCommitted false and no notice when the config was already committed', async () => {
    await new TarballStrategy().install(project, archive, targetDir);
    writeFileSync(join(project, CONFIG_FILE), `${BASE_CONFIG}exclude = "${EXCLUDE}"\n`);
    git(project, 'add', CONFIG_FILE);
    git(project, 'commit', '-q', '-m', 'config with exclude');

    const result = await new TarballStrategy([EXCLUDE]).update(project, targetDir, archive);

    expect(result.configCommitted).toBe(false);
    expect(result.configNotice).toBeUndefined();
    expect(committedFiles()).not.toContain(CONFIG_FILE);
  });
});
