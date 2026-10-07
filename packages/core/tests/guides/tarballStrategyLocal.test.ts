// TarballStrategy against real archives and real temp directories (only git and the network are mocked).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { TarballStrategy } from '../../src/guides/strategies/TarballStrategy.js';
import { GuideDetector } from '../../src/guides/GuideDetector.js';
import { EXCLUDE_RECORD_FILE, GUIDE_RELATIVE_PATH, LOCAL_VERSION_MARKER, VERSION_MARKER_FILE } from '../../src/guides/types.js';
import { gitExec, commitPathIfChanged } from '../../src/guides/gitExec.js';
import { buildGuideArchive, makeTempDir, readText, truncateArchive } from './helpers/guideArchiveFixture.js';

vi.mock('../../src/guides/gitExec.js', () => ({
  gitExec: vi.fn(),
  commitPathIfChanged: vi.fn(async () => true),
  withNetworkErrorHint: (message: string) => message,
}));

// The remote path downloads through undici; each test queues the archive bytes to serve.
const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock('undici', () => ({
  fetch: mockFetch,
  EnvHttpProxyAgent: vi.fn(() => ({ close: vi.fn(async () => {}) })),
}));

const mockGitExec = vi.mocked(gitExec);
const mockCommit = vi.mocked(commitPathIfChanged);

const REMOTE = 'https://github.com/ecorkran/ai-project-guide.git';

describe('TarballStrategy with real archives', () => {
  let project: string;
  let targetDir: string;
  let strategy: TarballStrategy;

  beforeEach(() => {
    vi.resetAllMocks();
    mockCommit.mockResolvedValue(true);
    project = makeTempDir('cf-tarball-project-');
    targetDir = join(project, GUIDE_RELATIVE_PATH);
    mkdirSync(join(project, 'project-documents'), { recursive: true });
    strategy = new TarballStrategy();
  });

  afterEach(() => {
    rmSync(project, { recursive: true, force: true });
  });

  function marker(): string {
    return readText(join(targetDir, VERSION_MARKER_FILE));
  }

  it('local install records the marker "local" and extracts the files', async () => {
    const archive = await buildGuideArchive({ dir: project });

    const result = await strategy.install(project, archive, targetDir);

    expect(result.version).toBe(LOCAL_VERSION_MARKER);
    expect(marker()).toBe(LOCAL_VERSION_MARKER);
    expect(readText(join(targetDir, 'project-guides/rules/r.md'))).toBe('# rule\n');
    expect(mockCommit).toHaveBeenCalledWith(
      project,
      GUIDE_RELATIVE_PATH,
      `docs: install ai-project-guide ${LOCAL_VERSION_MARKER}`
    );
  });

  it('local update over an existing guide swaps it', async () => {
    const first = await buildGuideArchive({ dir: project, fileName: 'one.tgz' });
    await strategy.install(project, first, targetDir);
    const second = await buildGuideArchive({
      dir: project,
      fileName: 'two.tgz',
      files: { 'project-guides/rules/r.md': '# changed\n' },
    });

    const result = await strategy.update(project, targetDir, second);

    expect(result.newVersion).toBe(LOCAL_VERSION_MARKER);
    expect(readText(join(targetDir, 'project-guides/rules/r.md'))).toBe('# changed\n');
    expect(existsSync(join(targetDir, 'scripts/s.sh'))).toBe(false);
  });

  it('local update with the same marker still stages (not short-circuited)', async () => {
    const first = await buildGuideArchive({ dir: project, fileName: 'one.tgz' });
    await strategy.install(project, first, targetDir);
    const second = await buildGuideArchive({
      dir: project,
      fileName: 'two.tgz',
      files: { 'project-guides/rules/r.md': '# second\n' },
    });
    expect(marker()).toBe(LOCAL_VERSION_MARKER);

    await strategy.update(project, targetDir, second);

    expect(readText(join(targetDir, 'project-guides/rules/r.md'))).toBe('# second\n');
  });

  describe('local marker status (design Integration Requirements)', () => {
    it('detect() returns version "local" after a local install', async () => {
      await strategy.install(project, await buildGuideArchive({ dir: project }), targetDir);

      expect(await strategy.detect(project, targetDir)).toEqual({
        method: 'tarball',
        version: LOCAL_VERSION_MARKER,
        source: null,
      });
    });

    it('reports an update available when a remote tag exists', async () => {
      await strategy.install(project, await buildGuideArchive({ dir: project }), targetDir);
      mockGitExec.mockResolvedValue({ stdout: 'abc\trefs/tags/v0.3.0\n', stderr: '' });

      const info = await new GuideDetector().detect(project, REMOTE);

      expect(info.version).toBe(LOCAL_VERSION_MARKER);
      expect(info.latestVersion).toBe('v0.3.0');
      expect(info.updateAvailable).toBe(true);
    });

    it('a following plain update records the latest remote tag, not "local"', async () => {
      await strategy.install(project, await buildGuideArchive({ dir: project }), targetDir);
      const remoteArchive = await buildGuideArchive({ dir: project, fileName: 'remote.tgz' });
      mockGitExec.mockResolvedValue({ stdout: 'abc\trefs/tags/v0.3.0\n', stderr: '' });
      mockFetch.mockResolvedValue(new Response(readFileSync(remoteArchive)));

      const result = await strategy.update(project, targetDir, REMOTE);

      expect(result.previousVersion).toBe(LOCAL_VERSION_MARKER);
      expect(result.newVersion).toBe('v0.3.0');
      expect(marker()).toBe('v0.3.0');
    });
  });

  describe('archive failures leave the installed guide untouched', () => {
    const stagingDir = (): string => join(project, 'project-documents', '.ai-project-guide.staging');

    async function installBaseline(): Promise<void> {
      await strategy.install(project, await buildGuideArchive({ dir: project, fileName: 'base.tgz' }), targetDir);
    }

    function expectGuideIntact(): void {
      expect(readText(join(targetDir, 'project-guides/rules/r.md'))).toBe('# rule\n');
      expect(existsSync(stagingDir())).toBe(false);
    }

    it('a truncated archive throws naming the file', async () => {
      await installBaseline();
      const corrupt = truncateArchive(await buildGuideArchive({ dir: project, fileName: 'whole.tgz' }));

      await expect(strategy.update(project, targetDir, corrupt)).rejects.toThrow(
        `Reading guide archive ${corrupt} failed`
      );
      expectGuideIntact();
    });

    it('a multi-top-level archive throws', async () => {
      await installBaseline();
      const multi = await buildGuideArchive({ dir: project, fileName: 'multi.tgz', secondRoot: 'other-root' });

      await expect(strategy.update(project, targetDir, multi)).rejects.toThrow(
        'Archive must contain a single top-level directory'
      );
      expectGuideIntact();
    });

    it('a failed first install leaves no guide and no staging directory', async () => {
      const corrupt = truncateArchive(await buildGuideArchive({ dir: project }));

      await expect(strategy.install(project, corrupt, targetDir)).rejects.toThrow('Reading guide archive');
      expect(existsSync(targetDir)).toBe(false);
      expect(existsSync(stagingDir())).toBe(false);
    });
  });

  describe('preview, confirm and unchanged flow', () => {
    const stagingDir = (): string => join(project, 'project-documents', '.ai-project-guide.staging');
    const guideFile = (): string => join(targetDir, 'project-guides/rules/r.md');

    // One file changed, one added, one removed relative to the default fixture.
    const changedFiles = {
      'project-guides/lint/csharp/a.txt': 'csharp lint\n',
      'project-guides/lint/python/b.txt': 'python lint\n',
      'project-guides/rules/r.md': '# changed\n',
      'new.md': 'new\n',
    };

    async function installBaselineAndBuildChanged(): Promise<string> {
      await strategy.install(project, await buildGuideArchive({ dir: project, fileName: 'base.tgz' }), targetDir);
      mockCommit.mockClear();
      return buildGuideArchive({ dir: project, fileName: 'changed.tgz', files: changedFiles });
    }

    it('hands the counts to confirm, then swaps and commits on true', async () => {
      const changed = await installBaselineAndBuildChanged();
      const confirm = vi.fn(async () => true);

      const result = await strategy.update(project, targetDir, changed, { confirm });

      expect(confirm).toHaveBeenCalledWith(
        { added: 1, removed: 1, changed: 1 },
        { from: LOCAL_VERSION_MARKER, to: LOCAL_VERSION_MARKER }
      );
      expect(result.preview).toEqual({ added: 1, removed: 1, changed: 1 });
      expect(readText(guideFile())).toBe('# changed\n');
      expect(mockCommit).toHaveBeenCalledTimes(1);
      expect(existsSync(stagingDir())).toBe(false);
    });

    it('cancels on false: guide unchanged, no staging, no commit', async () => {
      const changed = await installBaselineAndBuildChanged();

      const result = await strategy.update(project, targetDir, changed, { confirm: async () => false });

      expect(result).toMatchObject({ cancelled: true, preview: { added: 1, removed: 1, changed: 1 } });
      expect(readText(guideFile())).toBe('# rule\n');
      expect(existsSync(join(targetDir, 'scripts/s.sh'))).toBe(true);
      expect(existsSync(stagingDir())).toBe(false);
      expect(mockCommit).not.toHaveBeenCalled();
    });

    it('reports unchanged for an identical archive: no swap, no commit, no prompt', async () => {
      const baseline = await buildGuideArchive({ dir: project, fileName: 'base.tgz' });
      await strategy.install(project, baseline, targetDir);
      mockCommit.mockClear();
      const confirm = vi.fn(async () => true);

      const result = await strategy.update(project, targetDir, baseline, { confirm });

      expect(result).toMatchObject({ unchanged: true, preview: { added: 0, removed: 0, changed: 0 } });
      expect(confirm).not.toHaveBeenCalled();
      expect(mockCommit).not.toHaveBeenCalled();
      expect(existsSync(stagingDir())).toBe(false);
    });

    it('swaps and commits without a prompt when only the bookkeeping differs', async () => {
      const baseline = await buildGuideArchive({ dir: project, fileName: 'base.tgz' });
      await strategy.install(project, baseline, targetDir);
      mockCommit.mockClear();
      const confirm = vi.fn(async () => true);
      // guide.exclude changed to a pattern that matches no file: identical files, new exclude record.
      const withExclude = new TarballStrategy(['does-not-exist']);

      const result = await withExclude.update(project, targetDir, baseline, { confirm });

      expect(result.unchanged).toBeUndefined();
      expect(result.preview).toEqual({ added: 0, removed: 0, changed: 0 });
      expect(confirm).not.toHaveBeenCalled();
      expect(mockCommit).toHaveBeenCalledTimes(1);
      expect(readText(join(targetDir, EXCLUDE_RECORD_FILE))).toBe('does-not-exist\n');
    });

    it('proceeds with the preview in the result when no confirm is provided', async () => {
      const changed = await installBaselineAndBuildChanged();

      const result = await strategy.update(project, targetDir, changed);

      expect(result.preview).toEqual({ added: 1, removed: 1, changed: 1 });
      expect(readText(guideFile())).toBe('# changed\n');
    });

    it('removes staging and propagates when confirm throws', async () => {
      const changed = await installBaselineAndBuildChanged();

      await expect(
        strategy.update(project, targetDir, changed, {
          confirm: async () => {
            throw new Error('prompt exploded');
          },
        })
      ).rejects.toThrow('prompt exploded');

      expect(existsSync(stagingDir())).toBe(false);
      expect(readText(guideFile())).toBe('# rule\n');
    });
  });

  it('leaves no staging directory behind after a successful local install', async () => {
    await strategy.install(project, await buildGuideArchive({ dir: project }), targetDir);

    const leftovers = readdirSync(join(project, 'project-documents')).filter((name) => name.includes('.staging'));
    expect(leftovers).toEqual([]);
  });
});
