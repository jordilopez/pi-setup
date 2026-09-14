/**
 * Shared helpers for the git extension commands.
 *
 * Holds the trunk-branch definitions, the branch-name validation helper, and
 * the branch-creation function used by `/git:create-branch`.
 */

import { execFileSync } from "node:child_process";

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

export interface CreateBranchOptions {
  branchName: string;
  /** Base ref to branch from, e.g. "master", "main", or "HEAD". */
  baseRef: string;
  /** Repository directory the branch is created in. */
  cwd: string;
}

export interface CreateBranchResult {
  branchName: string;
  baseRef: string;
  cwd: string;
}

/**
 * Creates a regular feature branch in `cwd` from `baseRef` and checks it out.
 *
 * - The branch name must pass the safe-name rules (`assertSafeBranchName`):
 *   git-ref-safe characters, no `.` / `..` path segments.
 * - Trunk branches (`master`, `main`, `develop`) are refused as names so the
 *   current branch is never accidentally switched to a trunk.
 * - If the branch already exists, an actionable error is thrown instead of
 *   silently checking out the pre-existing branch.
 *
 * Returns the created branch's identity. Throws on any git failure.
 */
export function createBranch(options: CreateBranchOptions): CreateBranchResult {
  const { branchName, baseRef, cwd } = options;

  if (!branchName) {
    throw new Error("Branch name is required");
  }
  // Shared safe-name rules: alphanumerics + `._/-`, no `.` / `..` segments
  assertSafeBranchName(branchName);

  if (TRUNK_BRANCHES.includes(branchName)) {
    throw new Error(
      `Refusing to create branch "${branchName}" — that's a trunk branch ` +
        `(${TRUNK_BRANCHES.join(", ")}). Use a feature branch name instead.`,
    );
  }

  if (!baseRef) {
    throw new Error(`No base ref provided for branch "${branchName}"`);
  }

  try {
    execFileSync("git", ["checkout", "-b", branchName, baseRef], {
      cwd,
      stdio: "pipe",
      timeout: 30_000,
    });
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString().trim() ?? "";
    const detail = stderr || (err instanceof Error ? err.message : String(err));

    if (/already exists/i.test(detail)) {
      throw new Error(
        `Branch "${branchName}" already exists in ${cwd} — check it out or ` + `delete it first, then retry.`,
      );
    }

    throw new Error(`Failed to create branch "${branchName}" from "${baseRef}" in ${cwd}: ${detail}`);
  }

  return { branchName, baseRef, cwd };
}
