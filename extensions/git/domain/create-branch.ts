/**
 * Branch-creation discovery. Detects the trunk branches that exist locally
 * and the repo's default branch, purely through the `Executor` port.
 */

import type { Executor } from "../ports/executor.ts";
import { TRUNK_BRANCHES } from "./branch-policy.ts";

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
