import { readFile, writeFile } from 'node:fs/promises';
import type { FixLogEntry } from '../types.js';

/**
 * Update a checkbox on a specific line in a markdown file.
 * Toggles between `[ ]` and `[x]` based on the `checked` parameter.
 */
export async function updateCheckbox(
  filePath: string,
  lineIndex: number,
  checked: boolean
): Promise<FixLogEntry> {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  if (lineIndex < 0 || lineIndex >= lines.length) {
    throw new Error(`Line index ${lineIndex} out of range (file has ${lines.length} lines)`);
  }

  const line = lines[lineIndex];
  const uncheckedPattern = /\[ \]/;
  const checkedPattern = /\[x\]/i;

  if (!uncheckedPattern.test(line) && !checkedPattern.test(line)) {
    throw new Error(`Line ${lineIndex} does not contain a checkbox pattern: "${line.trim()}"`);
  }

  const before = uncheckedPattern.test(line) ? '[ ]' : '[x]';
  const after = checked ? '[x]' : '[ ]';

  if (checked) {
    lines[lineIndex] = line.replace(uncheckedPattern, '[x]');
  } else {
    lines[lineIndex] = line.replace(checkedPattern, '[ ]');
  }

  await writeFile(filePath, lines.join('\n'), 'utf-8');

  return {
    rule: '',
    action: 'update-checkbox',
    filePath,
    before,
    after,
  };
}

/**
 * Update a YAML frontmatter field value in a markdown file.
 * Finds the key in the frontmatter block and replaces its value.
 */
export async function updateFrontmatterField(
  filePath: string,
  key: string,
  value: string
): Promise<FixLogEntry> {
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  if (lines.length === 0 || lines[0].trim() !== '---') {
    throw new Error(`File does not contain YAML frontmatter: ${filePath}`);
  }

  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closingIndex = i;
      break;
    }
  }

  if (closingIndex === -1) {
    throw new Error(`Frontmatter not closed in: ${filePath}`);
  }

  // Find the key within frontmatter bounds
  let keyLineIndex = -1;
  let beforeValue = '';
  for (let i = 1; i < closingIndex; i++) {
    const line = lines[i];
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const lineKey = line.slice(0, colonIdx).trim();
    if (lineKey === key) {
      keyLineIndex = i;
      beforeValue = line.slice(colonIdx + 1).trim();
      // Strip surrounding quotes
      if (
        beforeValue.length >= 2 &&
        ((beforeValue.startsWith("'") && beforeValue.endsWith("'")) ||
          (beforeValue.startsWith('"') && beforeValue.endsWith('"')))
      ) {
        beforeValue = beforeValue.slice(1, -1);
      }
      break;
    }
  }

  if (keyLineIndex === -1) {
    throw new Error(`Frontmatter key "${key}" not found in: ${filePath}`);
  }

  // Replace the value, preserving the key and any leading whitespace
  const originalLine = lines[keyLineIndex];
  const colonIdx = originalLine.indexOf(':');
  lines[keyLineIndex] = originalLine.slice(0, colonIdx + 1) + ' ' + value;

  await writeFile(filePath, lines.join('\n'), 'utf-8');

  return {
    rule: '',
    action: 'update-frontmatter',
    filePath,
    field: key,
    before: beforeValue,
    after: value,
  };
}
