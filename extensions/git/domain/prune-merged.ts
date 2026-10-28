/**
 * Branch-merge analysis for `git_prune_merged_branches`.
 *
 * Pure with respect to pi: the parsers, candidate selection, verdict fusion,
 * and rendering are unit-testable without any adapter, and the read-only
 * lookups (default branch, merged-PR index) reach git/gh only through the
 * `Executor` port.
 */

import type { Executor } from "../ports/executor.ts";
import type { Ui } from "../ports/ui.ts";
import { TRUNK_BRANCHES } from "./branch-policy.ts";
import { execOk } from "./exec.ts";
import type { KeptBranch, MergeEvidence, PrunableBranch, PruneMergedBranchesResult, SkippedBranch } from "./types.ts";

/** Remote whose default branch defines "merged in origin". */
export const REMOTE = "origin";

/** Maximum `gh pr list` page size used to build the merged-PR index. */
export const GH_PR_LIMIT = 1000;

/** Maximum branches listed by name in the confirmation dialog. */
export const CONFIRM_LIMIT = 20;

/**
 * Splits `git for-each-ref` output into branch names, dropping blank lines.
 */
export function parseBranchList(stdout: string): string[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Extracts the branch checked out in each worktree from
 * `git worktree list --porcelain`. Detached worktrees contribute nothing.
 */
export function parseWorktreeBranches(porcelain: string): string[] {
  const branches: string[] = [];
  for (const line of porcelain.split("\n")) {
    const match = /^branch refs\/heads\/(.+)$/.exec(line.trim());
    if (match) branches.push(match[1]);
  }
  return branches;
}

/**
 * Builds a branch → PR URL index from `gh pr list` output formatted as one
 * `headRefName url` pair per line. Malformed lines are ignored, and the newest
 * (first) PR wins when a branch name is reused.
 */
export function parseMergedPrs(stdout: string): Map<string, string> {
  const merged = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const separator = trimmed.indexOf(" ");
    if (separator <= 0) continue;
    const branch = trimmed.slice(0, separator);
    if (!merged.has(branch)) merged.set(branch, trimmed.slice(separator + 1).trim());
  }
  return merged;
}

/**
 * Chooses the branches worth merge-checking.
 *
 * Skips the current branch, trunk branches, branches checked out in any
 * worktree (git refuses to delete those), duplicates, and option-like names
 * that a CLI could parse as a flag.
 */
export function selectCandidates(
  branches: string[],
  context: { current: string; trunk: string[]; worktrees: string[] },
): { candidates: string[]; skipped: SkippedBranch[] } {
  const { current, trunk, worktrees } = context;
  const candidates: string[] = [];
  const skipped: SkippedBranch[] = [];
  const seen = new Set<string>();

  for (const branch of branches) {
    const name = branch.trim();
    if (seen.has(name)) continue;
    seen.add(name);

    if (!name || name.startsWith("-")) {
      skipped.push({ branch: name, reason: "unsafe branch name" });
    } else if (name === current) {
      skipped.push({ branch: name, reason: "current branch" });
    } else if (trunk.includes(name)) {
      skipped.push({ branch: name, reason: "trunk branch" });
    } else if (worktrees.includes(name)) {
      skipped.push({ branch: name, reason: "checked out in another worktree" });
    } else {
      candidates.push(name);
    }
  }

  return { candidates, skipped };
}

/**
 * Turns the two evidence sources into a single verdict. `git merge-base
 * --is-ancestor` uses exit 0 for "is an ancestor" and 1 for "is not"; any
 * other code is a real failure and must not be read as "unmerged".
 */
export function classifyMerge(
  ancestorCode: number,
  prUrl: string | undefined,
  ghError: string | undefined,
): MergeEvidence {
  if (ancestorCode === 0) return { kind: "ancestor" };
  if (ancestorCode !== 1) {
    return { kind: "unknown", reason: `git merge-base --is-ancestor failed (exit ${ancestorCode})` };
  }
  if (ghError) return { kind: "unknown", reason: ghError };
  return prUrl === undefined ? { kind: "unmerged" } : { kind: "pr", url: prUrl };
}

/**
 * Builds the pre-deletion confirmation text, truncating long lists.
 */
export function buildConfirmMessage(prunable: PrunableBranch[], base: string): string {
  const lines = prunable.slice(0, CONFIRM_LIMIT).map(({ branch, evidence }) => {
    const via = evidence.kind === "pr" ? `merged PR ${evidence.url}` : "ancestor of the base";
    return `• ${branch} (${via})`;
  });
  const remaining = prunable.length - lines.length;
  if (remaining > 0) lines.push(`…and ${remaining} more`);

  return (
    `Delete ${prunable.length} local branch(es) already merged into ${base}?\n\n` +
    `${lines.join("\n")}\n\nThis removes local branches only; origin is untouched.`
  );
}

/**
 * Renders the human-readable summary line(s) for the tool response.
 *
 * The headline always reports how many of the prunable branches were actually
 * deleted, so a partial or total deletion failure is never summarized as a
 * clean result; failures are detailed on their own line.
 */
export function buildSummary(result: PruneMergedBranchesResult): string {
  const parts: string[] = [];

  if (result.dryRun) {
    parts.push(
      result.prunable.length === 0
        ? `No local branches merged into ${result.base}.`
        : `${result.prunable.length} local branch(es) merged into ${result.base}:\n` +
            result.prunable.map(({ branch }) => `• ${branch}`).join("\n") +
            "\n\nDry run — nothing deleted.",
    );
  } else if (result.prunable.length === 0) {
    parts.push(`No local branches merged into ${result.base}.`);
  } else if (result.deleted.length === 0) {
    parts.push(`Deleted 0 of ${result.prunable.length} local branch(es) merged into ${result.base}.`);
  } else {
    parts.push(
      `Deleted ${result.deleted.length} of ${result.prunable.length} local branch(es) merged into ${result.base}:\n` +
        result.deleted.map(({ branch }) => `• ${branch}`).join("\n"),
    );
  }

  if (result.failed.length > 0) {
    parts.push(`Failed to delete: ${result.failed.map(({ branch }) => branch).join(", ")}`);
  }
  if (result.warning) {
    parts.push(`Note: ${result.warning}`);
  }

  return parts.join("\n\n");
}

/**
 * Resolves the remote default branch: `origin/HEAD` when set, otherwise the
 * first existing local trunk branch. Returns null when neither is available.
 */
export async function resolveDefaultBranch(
  executor: Executor,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<string | null> {
  const { stdout } = await executor.run("git", ["symbolic-ref", "--short", `refs/remotes/${REMOTE}/HEAD`], {
    cwd,
    signal,
  });
  const fromRemote = stdout.trim().replace(new RegExp(`^${REMOTE}/`), "");
  if (fromRemote && !fromRemote.startsWith("refs/")) return fromRemote;

  for (const candidate of TRUNK_BRANCHES) {
    const { code } = await executor.run("git", ["show-ref", "--verify", "--quiet", `refs/heads/${candidate}`], {
      cwd,
      signal,
    });
    if (code === 0) return candidate;
  }
  return null;
}

/**
 * Builds the merged-PR index with one `gh` call. Returns the index plus the
 * failure message when `gh` is unavailable, unauthenticated, or offline.
 */
export async function loadMergedPrs(
  executor: Executor,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<{ index: Map<string, string>; error?: string }> {
  const { code, stdout, stderr } = await executor.run(
    "gh",
    [
      "pr",
      "list",
      "--state",
      "merged",
      "--json",
      "headRefName,url",
      "--limit",
      String(GH_PR_LIMIT),
      "--jq",
      '.[] | .headRefName + " " + .url',
    ],
    { cwd, signal },
  );

  if (code !== 0) {
    return {
      index: new Map(),
      error: `merged-PR lookup unavailable, using ancestry only — gh pr list failed (exit ${code}): ${
        stderr.trim() || stdout.trim() || "no output"
      }`,
    };
  }
  return { index: parseMergedPrs(stdout) };
}

/** Input for {@link runPrunePlan}. */
export interface PruneInput {
  cwd: string;
  signal?: AbortSignal;
  /** Only list prunable branches; never confirm or delete. */
  dryRun: boolean;
}

/**
 * Outcome of a prune run: either the user declined the confirmation gate or
 * the run completed with a structured result.
 */
export type PruneOutcome = { kind: "cancelled" } | { kind: "done"; result: PruneMergedBranchesResult };

/**
 * Runs the full `git_prune_merged_branches` flow: discover the default branch
 * and candidates (read-only), collect merge evidence, gate deletion on user
 * confirmation, then delete and report. All I/O goes through the `Executor`
 * and `Ui` ports.
 */
export async function runPrunePlan(executor: Executor, ui: Ui, input: PruneInput): Promise<PruneOutcome> {
  const { cwd, signal, dryRun } = input;

  const defaultBranch = await resolveDefaultBranch(executor, cwd, signal);
  if (!defaultBranch) {
    throw new Error(`Cannot determine the default branch: no ${REMOTE}/HEAD and no local trunk branch`);
  }
  const base = `${REMOTE}/${defaultBranch}`;

  const { code: baseExists } = await executor.run(
    "git",
    ["show-ref", "--verify", "--quiet", `refs/remotes/${REMOTE}/${defaultBranch}`],
    { cwd, signal },
  );
  if (baseExists !== 0) {
    throw new Error(`Missing ${base} — run 'git fetch ${REMOTE}' first`);
  }

  // --- Read-only discovery -------------------------------------------------
  const { stdout: currentOut } = await executor.run("git", ["symbolic-ref", "--short", "HEAD"], { cwd, signal });
  const { stdout: branchesOut } = await execOk(
    executor,
    "git",
    ["for-each-ref", "--format=%(refname:short)", "refs/heads"],
    cwd,
    signal,
    "git for-each-ref",
  );
  const { stdout: worktreesOut } = await executor.run("git", ["worktree", "list", "--porcelain"], { cwd, signal });

  const { candidates, skipped } = selectCandidates(parseBranchList(branchesOut), {
    current: currentOut.trim(),
    trunk: TRUNK_BRANCHES,
    worktrees: parseWorktreeBranches(worktreesOut),
  });

  const { index: mergedPrs, error: ghError } = await loadMergedPrs(executor, cwd, signal);

  const prunable: PrunableBranch[] = [];
  const kept: KeptBranch[] = [];
  for (const branch of candidates) {
    const { code } = await executor.run("git", ["merge-base", "--is-ancestor", branch, base], { cwd, signal });
    const evidence = classifyMerge(code, mergedPrs.get(branch), ghError);
    if (evidence.kind === "ancestor" || evidence.kind === "pr") {
      prunable.push({ branch, evidence });
    } else {
      kept.push({
        branch,
        state: evidence.kind,
        reason: evidence.kind === "unknown" ? evidence.reason : undefined,
      });
    }
  }

  // --- Confirmation gate ---------------------------------------------------
  if (!dryRun && prunable.length > 0) {
    const confirmed = await ui.confirm("Prune merged branches", buildConfirmMessage(prunable, base));
    if (!confirmed) return { kind: "cancelled" };
  }

  // --- Deletion ------------------------------------------------------------
  const result: PruneMergedBranchesResult = {
    remote: REMOTE,
    base,
    defaultBranch,
    dryRun,
    prunable,
    deleted: [],
    kept,
    skipped,
    failed: [],
    ...(ghError ? { warning: ghError } : {}),
  };

  if (!dryRun) {
    for (const { branch, evidence } of prunable) {
      const { code, stderr } = await executor.run("git", ["branch", "-D", branch], { cwd, signal });
      if (code === 0) {
        result.deleted.push({
          branch,
          evidence: evidence.kind === "pr" ? "pr" : "ancestor",
          ...(evidence.kind === "pr" ? { url: evidence.url } : {}),
        });
      } else {
        result.failed.push({ branch, error: stderr.trim() || `exit ${code}` });
      }
    }
  }

  return { kind: "done", result };
}
