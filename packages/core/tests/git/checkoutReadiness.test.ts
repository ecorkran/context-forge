import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { checkoutReadiness } from '../../src/git/checkoutReadiness.js';
import { DeferReason } from '../../src/introspection/types.js';
import {
  createGitWorktreeFixture,
  detachHead,
  startConflictingMerge,
  writeRel,
  type GitWorktreeFixture,
} from '../helpers/gitWorktreeFixture.js';

const PATHS = ['docs/a.md', 'docs/b.md'];

let fx: GitWorktreeFixture;
let wt: string;

beforeEach(() => {
  fx = createGitWorktreeFixture(['b'], (primary) => {
    writeRel(primary, 'docs/a.md', 'a0\n');
    writeRel(primary, 'docs/b.md', 'b0\n');
  });
  wt = fx.worktrees.b;
});

afterEach(() => fx.cleanup());

describe('checkoutReadiness (slice 213 D5)', () => {
  it('clean worktree: ready, nothing dirty', async () => {
    expect(await checkoutReadiness(wt, PATHS)).toEqual({ blocked: null, dirtyPaths: [] });
  });

  it('missing directory: NOT_A_CHECKOUT', async () => {
    expect(await checkoutReadiness(join(fx.root, 'gone'), PATHS)).toEqual({
      blocked: DeferReason.NOT_A_CHECKOUT,
      dirtyPaths: [],
    });
  });

  it('a subdirectory of a checkout: NOT_A_CHECKOUT', async () => {
    const result = await checkoutReadiness(join(wt, 'docs'), PATHS);
    expect(result.blocked).toBe(DeferReason.NOT_A_CHECKOUT);
  });

  it('detached HEAD: DETACHED_HEAD', async () => {
    detachHead(wt);
    expect((await checkoutReadiness(wt, PATHS)).blocked).toBe(DeferReason.DETACHED_HEAD);
  });

  it('unresolved merge: CHECKOUT_BUSY', async () => {
    startConflictingMerge(wt);
    expect(await checkoutReadiness(wt, PATHS)).toEqual({
      blocked: DeferReason.CHECKOUT_BUSY,
      dirtyPaths: [],
    });
  });

  it('one of two target paths modified: only that path is dirty', async () => {
    writeRel(wt, 'docs/b.md', 'edited\n');
    expect(await checkoutReadiness(wt, PATHS)).toEqual({ blocked: null, dirtyPaths: ['docs/b.md'] });
  });
});
