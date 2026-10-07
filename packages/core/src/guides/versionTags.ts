// Semver tag parsing and ordering, shared by remote tag lookup and update detection.

/** The [major, minor, patch] of a tag such as `v0.20.3` or `0.20.3`. */
function parseSemverTag(tag: string): [number, number, number] {
  const [major, minor, patch] = tag.replace(/^v/, '').split('.').map(Number);
  return [major, minor, patch];
}

/** Sort comparator: newest tag first. */
export function compareSemverTagsNewestFirst(a: string, b: string): number {
  const pa = parseSemverTag(a);
  const pb = parseSemverTag(b);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pb[i] - pa[i];
  }
  return 0;
}
