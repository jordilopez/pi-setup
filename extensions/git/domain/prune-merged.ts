/**
 * Pure branch-merge analysis for `git_prune_merged_branches`.
 *
 * Parses git/gh output, selects deletion candidates, fuses the two evidence
 * sources into a verdict, and renders confirmation/summary text. No pi, no
 * filesystem, no cancellation — the adapter owns those.
 */

import type { MergeEvidence, PrunableBranch, PruneMergedBranchesResult, SkippedBranch } from "./types.ts";

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
