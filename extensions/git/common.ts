/**
 * Shared transitional helpers for the git extension commands.
 *
 * Still holds the pi-coupled leftovers of the pre-hexagonal layout:
 * `execOk` (the subprocess wrapper) and `createBranch` (the checkout step).
 * Trunk definitions and branch-name policy now live in `domain/branch-policy.ts`;
 * domain types in `domain/types.ts`. These two helpers migrate onto the
 * `Executor` port in a later task; this file is deleted once every consumer
 * has moved.
 */

import { execFileSync } from "node:child_process";

import type { ExtensionAPI, ExecResult } from "@earendil-works/pi-coding-agent";

import { assertSafeBranchName, TRUNK_BRANCHES } from "./domain/branch-policy.ts";
import type { CreateBranchOptions, CreateBranchResult } from "./domain/types.ts";

/**
 * Runs a command and throws a descriptive error on a non-zero exit.
 *
 * `label` names the operation in the error so a failing git or `gh` call is
 * never reported as bare exit status.
 */
export async function execOk(
  pi: ExtensionAPI,
  command: string,
  args: string[],
  cwd: string,
  signal: AbortSignal | undefined,
  label: string,
): Promise<ExecResult> {
  const result = await pi.exec(command, args, { cwd, signal });
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;
    throw new Error(`${label} failed: ${detail}`);
  }
  return result;
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
        { cause: err },
      );
    }

    throw new Error(`Failed to create branch "${branchName}" from "${baseRef}" in ${cwd}: ${detail}`, { cause: err });
  }

  return { branchName, baseRef, cwd };
}
