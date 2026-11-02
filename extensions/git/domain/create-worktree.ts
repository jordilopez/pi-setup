/**
 * Worktree-creation: path resolution, validation, and execution.
 *
 * A worktree is a second checkout of the same repository on its own branch,
 * so the flow combines the branch-name policy from `create-branch` with a
 * filesystem destination. This module resolves the destination against the
 * repo root, validates it, and reduces the request to a runnable
 * `git worktree add` plan; `runCreateWorktreePlan` executes it and interprets
 * git's failure modes. All subprocess access goes through the `Executor` port.
 */

import path from "node:path";

import type { Executor } from "../ports/executor.ts";
import { assertSafeBranchName, TRUNK_BRANCHES } from "./branch-policy.ts";
import type { CreateWorktreeOptions, CreateWorktreePlan, CreateWorktreeResult } from "./types.ts";

/**
 * Returns the absolute repository root via `git rev-parse --show-toplevel`,
 * falling back to `cwd` when git can't answer (not a repo / older git).
 */
export async function getRepoRoot(executor: Executor, cwd: string, signal?: AbortSignal): Promise<string> {
  const { stdout, code } = await executor.run("git", ["rev-parse", "--show-toplevel"], { cwd, signal });
  const root = code === 0 ? stdout.trim() : "";
  return root || cwd;
}

/**
 * Suggests a destination beside the repository, named after the repo and the
 * branch (slashes flattened), e.g. `/src/app-feature-x` for branch
 * `feature/x` in `/src/app`.
 */
export function defaultWorktreePath(repoRoot: string, branchName: string): string {
  return path.join(path.dirname(repoRoot), `${path.basename(repoRoot)}-${branchName.replaceAll("/", "-")}`);
}

/**
 * Resolves user input to an absolute worktree path. Relative input is
 * resolved against the repo root, so `../app-feature-x` lands beside the
 * repository rather than inside it.
 *
 * Rejects empty input, the repo root itself, and any path with a `.git` path
 * segment (a worktree must never be created inside git's own directory).
 *
 * @throws {Error} When the input is blank, starts with `~` (tilde is not
 * expanded), resolves to the repo root, or resolves inside a `.git` directory.
 */
export function resolveWorktreePath(rawPath: string, repoRoot: string): string {
  const input = rawPath.trim();
  if (!input) {
    throw new Error("Worktree path is required");
  }

  if (input.startsWith("~")) {
    throw new Error(
      `Tilde paths are not expanded — pass an absolute path or a path relative to the repository root ` +
        `(got "${input}")`,
    );
  }

  const root = path.resolve(repoRoot);
  const resolved = path.resolve(root, input);

  if (resolved === root) {
    throw new Error(`Refusing to create a worktree at the repository root itself (${resolved})`);
  }

  // Case-insensitive: macOS and Windows treat `.GIT` and `.git` as the same
  // directory, so an exact-match check would be bypassable there.
  const segments = path.relative(root, resolved).split(path.sep);
  if (segments.some((segment) => segment.toLowerCase() === ".git")) {
    throw new Error(`Refusing to create a worktree inside ".git" (${resolved})`);
  }

  return resolved;
}

/**
 * Validates a request and reduces it to a `git worktree add` plan. Pure:
 * decides *what* to run without running it.
 *
 * - The branch name must pass the safe-name rules (`assertSafeBranchName`)
 *   and must not be a trunk branch, matching `decideCreateBranch`.
 * - The path must already be absolute (the adapter resolves it with
 *   `resolveWorktreePath`), so the command never depends on the caller's cwd.
 * - `-b` creates the branch inside the new worktree, so the current checkout
 *   is left untouched.
 * - `--` ends option parsing before the destination, so a future change that
 *   allows relative paths or free-form refs cannot reintroduce option
 *   injection.
 *
 * @throws {Error} When the branch name is missing, unsafe, or a trunk name;
 * when no base ref is given; or when the path is missing or not absolute.
 */
export function decideCreateWorktree(options: CreateWorktreeOptions): CreateWorktreePlan {
  const { branchName, baseRef, path: worktreePath, cwd } = options;

  if (!branchName) {
    throw new Error("Branch name is required");
  }
  assertSafeBranchName(branchName);

  if (TRUNK_BRANCHES.includes(branchName)) {
    throw new Error(
      `Refusing to create worktree branch "${branchName}" — that's a trunk branch ` +
        `(${TRUNK_BRANCHES.join(", ")}). Use a feature branch name instead.`,
    );
  }

  if (!baseRef) {
    throw new Error(`No base ref provided for branch "${branchName}"`);
  }

  if (!worktreePath) {
    throw new Error("Worktree path is required");
  }

  if (!path.isAbsolute(worktreePath)) {
    throw new Error(`Worktree path must be absolute, got "${worktreePath}"`);
  }

  return {
    command: "git",
    args: ["worktree", "add", "-b", branchName, "--", worktreePath, baseRef],
    cwd,
    branchName,
    baseRef,
    path: worktreePath,
  };
}

/**
 * Runs a worktree plan and turns git's failure output into an actionable
 * error. The three common conflicts — existing branch, existing path, branch
 * already checked out elsewhere — each get a targeted message instead of a
 * bare `fatal:` line.
 *
 * @throws {Error} On a non-zero git exit, rewritten into an actionable message
 * for a duplicate branch, an occupied destination, a branch checked out in
 * another worktree, or a non-repository cwd; other failures keep git's detail.
 */
export async function runCreateWorktreePlan(
  executor: Executor,
  plan: CreateWorktreePlan,
  signal?: AbortSignal,
): Promise<CreateWorktreeResult> {
  const result = await executor.run(plan.command, plan.args, { cwd: plan.cwd, signal });

  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;

    if (/already checked out/i.test(detail)) {
      throw new Error(
        `Branch "${plan.branchName}" is already checked out in another worktree — ` +
          `remove that worktree or pick a different branch name, then retry.`,
      );
    }

    if (/already exists/i.test(detail)) {
      if (/branch named/i.test(detail) || detail.includes(`'${plan.branchName}'`)) {
        throw new Error(
          `Branch "${plan.branchName}" already exists in ${plan.cwd} — ` +
            `choose a different branch name, then retry.`,
        );
      }
      throw new Error(`Worktree path "${plan.path}" already exists — choose another path, then retry.`);
    }

    if (/not a git repository/i.test(detail)) {
      throw new Error(`${plan.cwd} is not a git repository: ${detail}`);
    }

    throw new Error(
      `Failed to create worktree "${plan.path}" for branch "${plan.branchName}" ` + `from "${plan.baseRef}": ${detail}`,
    );
  }

  return { branchName: plan.branchName, baseRef: plan.baseRef, path: plan.path };
}
