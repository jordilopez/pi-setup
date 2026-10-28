/**
 * Branch-creation: discovery, decision, and execution.
 *
 * Discovery detects the local trunk branches and the repo default branch;
 * `decideCreateBranch` validates a name and produces a runnable checkout
 * plan; `runCreateBranchPlan` executes it and interprets git's failures.
 * All subprocess access goes through the `Executor` port.
 */

import type { Executor } from "../ports/executor.ts";
import { assertSafeBranchName, TRUNK_BRANCHES } from "./branch-policy.ts";
import type { CreateBranchOptions, CreateBranchPlan, CreateBranchResult } from "./types.ts";

/**
 * Returns the trunk branches that exist locally in this repo.
 */
export async function getExistingTrunkBranches(
  executor: Executor,
  cwd: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const found: string[] = [];
  for (const candidate of TRUNK_BRANCHES) {
    const { code } = await executor.run("git", ["show-ref", "--verify", "--quiet", `refs/heads/${candidate}`], {
      cwd,
      signal,
    });
    if (code === 0) found.push(candidate);
  }
  return found;
}

/**
 * Detects the repo's default branch from origin/HEAD (e.g. `origin/main` →
 * `main`). Returns null when it can't be determined or isn't a trunk branch.
 */
export async function detectDefaultBranch(
  executor: Executor,
  cwd: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const { stdout } = await executor.run("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], {
    cwd,
    signal,
  });
  const ref = stdout?.trim();
  if (!ref) return null;
  const name = ref.replace(/^origin\//, "");
  return TRUNK_BRANCHES.includes(name) ? name : null;
}

/**
 * Validates a request and reduces it to a checkout plan. Pure: decides
 * *what* to run without running it.
 *
 * - The branch name must pass the safe-name rules (`assertSafeBranchName`):
 *   git-ref-safe characters, no `.` / `..` path segments.
 * - Trunk branches are refused as names so the current branch is never
 *   accidentally switched to a trunk.
 */
export function decideCreateBranch(options: CreateBranchOptions): CreateBranchPlan {
  const { branchName, baseRef, cwd } = options;

  if (!branchName) {
    throw new Error("Branch name is required");
  }
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

  return {
    command: "git",
    args: ["checkout", "-b", branchName, baseRef],
    cwd,
    branchName,
    baseRef,
  };
}

/**
 * Runs a checkout plan and turns git's failure output into an actionable
 * error. The "already exists" case gets a targeted message rather than a bare
 * "fatal: a branch named … already exists".
 */
export async function runCreateBranchPlan(
  executor: Executor,
  plan: CreateBranchPlan,
  signal?: AbortSignal,
): Promise<CreateBranchResult> {
  const result = await executor.run(plan.command, plan.args, { cwd: plan.cwd, signal });

  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || `exit ${result.code}`;

    if (/already exists/i.test(detail)) {
      throw new Error(
        `Branch "${plan.branchName}" already exists in ${plan.cwd} — check it out or delete it first, then retry.`,
      );
    }

    throw new Error(`Failed to create branch "${plan.branchName}" from "${plan.baseRef}" in ${plan.cwd}: ${detail}`);
  }

  return { branchName: plan.branchName, baseRef: plan.baseRef, cwd: plan.cwd };
}
