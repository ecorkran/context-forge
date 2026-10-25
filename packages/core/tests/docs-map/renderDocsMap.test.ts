import { describe, it, expect } from 'vitest';
import { renderManagedBlock, EMPTY_MAP_LINE } from '../../src/docs-map/renderDocsMap.js';
import type { MappedDoc } from '../../src/docs-map/discoverDocs.js';

const MAP_DIR = 'project-documents/user/architecture';

describe('renderManagedBlock', () => {
  it('groups ADRs before docs and sorts each group by path', () => {
    const docs: MappedDoc[] = [
      { kind: 'doc', path: 'docs/zeta.md', title: 'Zeta' },
      { kind: 'adr', path: 'docs/adr/0002-b.md', title: 'B' },
      { kind: 'doc', path: 'README.md', title: 'Readme' },
      { kind: 'adr', path: 'docs/adr/0001-a.md', title: 'A' },
    ];
    const lines = renderManagedBlock(docs, MAP_DIR).split('\n');
    expect(lines.filter((l) => l.startsWith('- ')).map((l) => l.split('`')[1])).toEqual([
      'docs/adr/0001-a.md',
      'docs/adr/0002-b.md',
      'README.md',
      'docs/zeta.md',
    ]);
    expect(lines.indexOf('## Architecture Decision Records')).toBeLessThan(lines.indexOf('## Documentation'));
  });

  it('omits a group with no entries', () => {
    const block = renderManagedBlock([{ kind: 'doc', path: 'README.md', title: 'R' }], MAP_DIR);
    expect(block).not.toContain('Architecture Decision Records');
    expect(block).toContain('## Documentation');
  });

  it('renders the single empty-result line for no input', () => {
    expect(renderManagedBlock([], MAP_DIR)).toBe(EMPTY_MAP_LINE);
  });

  it('percent-encodes spaces in the link but not in the code span', () => {
    const block = renderManagedBlock([{ kind: 'doc', path: 'docs/my guide.md', title: 'Guide' }], MAP_DIR);
    expect(block).toContain('(../../../docs/my%20guide.md)');
    expect(block).toContain('`docs/my guide.md`');
  });

  it('escapes characters that would break the link destination or link text', () => {
    const block = renderManagedBlock(
      [{ kind: 'doc', path: 'docs/a (v2) #1 100%.md', title: 'Guide [draft] \\ notes' }],
      MAP_DIR,
    );
    expect(block).toContain('(../../../docs/a%20%28v2%29%20%231%20100%25.md)');
    expect(block).toContain('[Guide \\[draft\\] \\\\ notes]');
    expect(block).toContain('`docs/a (v2) #1 100%.md`');
  });

  it('links relative to the map directory', () => {
    const block = renderManagedBlock(
      [
        { kind: 'adr', path: 'docs/adr/0001-x.md', title: 'X' },
        { kind: 'doc', path: 'README.md', title: 'R' },
      ],
      MAP_DIR,
    );
    expect(block).toContain('(../../../docs/adr/0001-x.md)');
    expect(block).toContain('(../../../README.md)');
  });

  it("matches the design's example block", () => {
    const block = renderManagedBlock(
      [
        { kind: 'doc', path: 'docs/deployment.md', title: 'Deployment' },
        { kind: 'doc', path: 'README.md', title: 'Acme Service' },
        {
          kind: 'adr',
          path: 'docs/adr/0001-record-architecture-decisions.md',
          title: '1. Record architecture decisions',
        },
      ],
      MAP_DIR,
    );
    expect(block).toBe(
      [
        '## Architecture Decision Records',
        '- [1. Record architecture decisions](../../../docs/adr/0001-record-architecture-decisions.md) — `docs/adr/0001-record-architecture-decisions.md`',
        '',
        '## Documentation',
        '- [Acme Service](../../../README.md) — `README.md`',
        '- [Deployment](../../../docs/deployment.md) — `docs/deployment.md`',
      ].join('\n'),
    );
  });
});
