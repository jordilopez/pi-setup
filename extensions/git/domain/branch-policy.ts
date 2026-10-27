/**
 * Branch-naming policy for the git extension.
 *
 * Pure: no imports from pi, no `node:fs`/`node:os`, no side effects. This is
 * the one place that decides what is and isn't a legal branch name, so the
 * rule is written once and shared by the slash command and the tools.
 */

/**
 * Trunk branches that can serve as the base for a new branch.
 */
export const TRUNK_BRANCHES = ["master", "main", "develop"];

/**
 * Rejects branch names that could inject into shell commands or escape the
 * repository ref namespace. Accepts git-ref-safe names only (alphanumerics,
 * `.`, `_`, `/`, `-`), so backslashes, quotes, whitespace, and shell
 * metacharacters are all rejected; `.` / `..` path segments are rejected too.
 */
export function assertSafeBranchName(branchName: string): void {
  if (!branchName || !/^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/.test(branchName)) {
    throw new Error(`Unsafe branch name: "${branchName}"`);
  }
  const segments = branchName.split("/");
  if (segments.some((s) => s === ".." || s === ".")) {
    throw new Error(`Unsafe branch name: "${branchName}"`);
  }
}

/**
 * Converts any string to kebab-case.
 * Handles camelCase, PascalCase, spaces, underscores, and hyphens.
 */
export function toKebabCase(input: string): string {
  return (
    input
      .trim()
      // Insert hyphen between lower→upper transitions (camelCase)
      .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
      // Insert hyphen between letter/number sequences (separated by non-alphanumeric)
      .replace(/[\s_]+/g, "-")
      // Lowercase everything
      .toLowerCase()
      // Remove any character that isn't alphanumeric or hyphen
      .replace(/[^a-z0-9-]/g, "")
      // Collapse multiple hyphens
      .replace(/-+/g, "-")
      // Strip leading/trailing hyphens
      .replace(/^-+|-+$/g, "")
  );
}
