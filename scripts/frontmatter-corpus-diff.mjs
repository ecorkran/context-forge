#!/usr/bin/env node
// One-off differential verification harness for slice 917 / issue #64.
// Parses every .md file under <root>/project-documents/ in each given
// project root with both the pre-fix and post-fix frontmatter parsers and
// diffs the results field-by-field. Not shipped in packages/core/src — this
// is a throwaway audit tool, not a permanent CLI command (design TD-3/TD-4).
//
// Usage: node scripts/frontmatter-corpus-diff.mjs <root1> [root2 ...]

import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { parseFrontmatter as parseFrontmatterNew } from '../packages/core/dist/introspection/parsers/frontmatterParser.js';

// Preserved copy of the pre-fix parser body (frontmatterParser.ts, as it
// stood before Task 1.3's indentation-aware rewrite) — a frozen snapshot,
// not a live git-stash/checkout, per design TD-3.
async function parseFrontmatterOld(filePath) {
  const empty = { filePath, found: false, data: {} };
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    if (lines.length === 0 || lines[0].trim() !== '---') {
      return empty;
    }

    const data = {};
    for (let i = 1; i < lines.length; i++) {
      const stripped = lines[i].trim();
      if (stripped === '---') {
        return { filePath, found: true, data };
      }
      if (stripped.includes(':')) {
        const colonIdx = stripped.indexOf(':');
        const key = stripped.slice(0, colonIdx).trim();
        let val = stripped.slice(colonIdx + 1).trim();
        if (
          val.length >= 2 &&
          ((val.startsWith("'") && val.endsWith("'")) ||
            (val.startsWith('"') && val.endsWith('"')))
        ) {
          val = val.slice(1, -1);
        }
        if (key) {
          data[key] = val;
        }
      }
    }
    return empty;
  } catch {
    return empty;
  }
}

async function discoverMarkdownFiles(dir, progress) {
  const results = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    console.log(`file skipped: ${dir} (${err.message})`);
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await discoverMarkdownFiles(full, progress)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(full);
      progress.count += 1;
      if (progress.count % 200 === 0) {
        console.log(`  ...discovered ${progress.count} files so far`);
      }
    }
  }
  return results;
}

function diffData(oldData, newData) {
  const keys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  const changes = [];
  for (const key of keys) {
    if (oldData[key] !== newData[key]) {
      changes.push({ key, oldValue: oldData[key], newValue: newData[key] });
    }
  }
  return changes;
}

async function scanRoot(root) {
  // Scoped to project-documents/user/ — the PM confirmed (slice 917 Task 2.2)
  // that only this subtree is guaranteed to have frontmatter on every .md
  // file; the wider project-documents/ tree can contain non-frontmatter docs
  // that would just add diff noise, not signal.
  const docsDir = join(root, 'project-documents', 'user');
  try {
    const st = await stat(docsDir);
    if (!st.isDirectory()) throw new Error('not a directory');
  } catch {
    console.log(`root skipped: ${root} (no project-documents/user/)`);
    return { scanned: 0, unchanged: 0, changed: [], thrown: [] };
  }

  console.log(`Scanning ${docsDir} ...`);
  const files = await discoverMarkdownFiles(docsDir, { count: 0 });
  console.log(`  found ${files.length} markdown files`);

  let unchanged = 0;
  const changed = [];
  const thrown = [];

  for (const filePath of files) {
    let oldResult;
    let newResult;
    try {
      oldResult = await parseFrontmatterOld(filePath);
    } catch (err) {
      thrown.push({ filePath, parser: 'old', error: err.message });
      continue;
    }
    try {
      newResult = await parseFrontmatterNew(filePath);
    } catch (err) {
      thrown.push({ filePath, parser: 'new', error: err.message });
      continue;
    }

    if (oldResult.found !== newResult.found) {
      changed.push({ filePath, fields: [{ key: '(found)', oldValue: oldResult.found, newValue: newResult.found }] });
      continue;
    }
    const fields = diffData(oldResult.data, newResult.data);
    if (fields.length > 0) {
      changed.push({ filePath, fields });
    } else {
      unchanged += 1;
    }
  }

  return { scanned: files.length, unchanged, changed, thrown };
}

async function main() {
  const roots = process.argv.slice(2);
  if (roots.length === 0) {
    console.error('Usage: node scripts/frontmatter-corpus-diff.mjs <root1> [root2 ...]');
    process.exitCode = 1;
    return;
  }

  let totalScanned = 0;
  let totalUnchanged = 0;
  const allChanged = [];
  const allThrown = [];

  for (const root of roots) {
    const result = await scanRoot(root);
    totalScanned += result.scanned;
    totalUnchanged += result.unchanged;
    allChanged.push(...result.changed.map((c) => ({ ...c, root })));
    allThrown.push(...result.thrown.map((t) => ({ ...t, root })));
  }

  console.log('\n=== Summary ===');
  console.log(`Files scanned:   ${totalScanned}`);
  console.log(`Unchanged:       ${totalUnchanged}`);
  console.log(`Changed:         ${allChanged.length}`);
  console.log(`Parser throws:   ${allThrown.length}`);

  if (allChanged.length > 0) {
    console.log('\n--- Changed files ---');
    for (const { root, filePath, fields } of allChanged) {
      console.log(`\n[${root}] ${filePath}`);
      for (const { key, oldValue, newValue } of fields) {
        console.log(`  ${key}: ${JSON.stringify(oldValue)} -> ${JSON.stringify(newValue)}`);
      }
    }
  }

  if (allThrown.length > 0) {
    console.log('\n--- Parser exceptions (hard signal — investigate before considering the fix verified) ---');
    for (const { root, filePath, parser, error } of allThrown) {
      console.log(`[${root}] ${filePath} (${parser} parser): ${error}`);
    }
  }
}

main();
