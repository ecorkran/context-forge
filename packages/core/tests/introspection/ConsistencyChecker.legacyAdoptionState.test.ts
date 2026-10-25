import { afterEach, describe, expect, it } from 'vitest';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConsistencyChecker } from '../../src/introspection/ConsistencyChecker.js';
import { ArtifactIntrospector } from '../../src/introspection/ArtifactIntrospector.js';
import { ConfigManager } from '../../src/config/ConfigManager.js';
import { LEGACY_ADOPTION_STATES } from '../../src/config/ConfigKeys.js';
import type { ConsistencyFinding } from '../../src/introspection/types.js';
import { MIXED_ENTRIES, createAdoptionFixture } from '../helpers/adoptionFixtures.js';

const CONFIG_FILE = '.context-forge.toml';
const REGISTERED = { fileArch: '100-arch.existing', fileSlicePlan: '100-slices.existing' };

describe('ConsistencyChecker with a legacy adoption.state (slice 269)', () => {
  const roots: string[] = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  });

  it.each(LEGACY_ADOPTION_STATES)('findings are identical with and without adoption.state = %j', async (value) => {
    const fixture = createAdoptionFixture({ concept: true, arch: true, plan: MIXED_ENTRIES });
    roots.push(fixture.root);
    const project = fixture.project(REGISTERED);
    // The real ConfigManager reads the project's .context-forge.toml, so the stored value is in play.
    const check = async (): Promise<ConsistencyFinding[]> =>
      (await new ConsistencyChecker(new ArtifactIntrospector(), new ConfigManager(fixture.root)).checkAll(project))
        .findings;

    const without = await check();
    writeFileSync(join(fixture.root, CONFIG_FILE), `[adoption]\nstate = "${value}"\n`);
    const withLegacy = await check();

    expect(withLegacy).toEqual(without);
  });
});
