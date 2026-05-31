/**
 * Normalize artifact field values to bare stems.
 *
 * Artifact values can arrive in three forms:
 * - Bare stem: "100-arch.foo" (normalized, ready to use)
 * - Path with extension: "project-documents/user/architecture/100-arch.foo.md" (pre-v0.8 format)
 * - Stem with extension: "100-arch.foo.md" (user input)
 *
 * This function normalizes all three to bare stems so that resolveArtifactPath
 * can join them with the directory and extension without duplication.
 *
 * @param value - The artifact value to normalize
 * @returns The bare stem (e.g., "100-arch.foo")
 */
export function normalizeArtifactValue(value: string): string {
  // Strip leading directory path (keep only filename)
  const basename = value.includes('/') ? value.split('/').pop()! : value;
  // Strip trailing .md extension
  return basename.endsWith('.md') ? basename.slice(0, -3) : basename;
}
