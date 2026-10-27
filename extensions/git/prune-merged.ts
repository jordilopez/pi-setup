/**
 * Git Prune Merged Branches — `git_prune_merged_branches` tool
 *
 * Finds local branches whose work has already landed on the remote default
 * branch and deletes them. Two independent kinds of evidence count as
 * "merged in origin":
 *
 *  - **ancestor** — the branch tip is an ancestor of `origin/<default>`, so a
 *    real (merge-commit or fast-forward) merge brought it in;
 *  - **merged PR** — `gh` reports a merged pull request whose head is that
 *    branch, which is the only way to see squash- and rebase-merged work.
 *
 * Everything read-only happens first (default branch, branch list, worktrees,
 * one batched `gh pr list`, per-branch `git merge-base`), then the user
 * confirms the deletion list before any `git branch -D` runs. Branches that
 * are current, trunk, or checked out in another worktree are never touched,
 * and an unreachable `gh` degrades to ancestor-only evidence instead of
 * failing or guessing.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { execOk, TRUNK_BRANCHES } from "./common.ts";

/** Remote whose default branch defines "merged in origin". */
export const REMOTE = "origin";

/** Maximum `gh pr list` page size used to build the merged-PR index. */
const GH_PR_LIMIT = 1000;

/** Maximum branches listed by name in the confirmation dialog. */
const CONFIRM_LIMIT = 20;

/** What we know about one branch's merge status. */
export type MergeEvidence =
  { kind: "ancestor" } | { kind: "pr"; url: string } | { kind: "unmerged" } | { kind: "unknown"; reason: string };

/** Branch worth deleting, paired with the evidence that justified it. */
export interface PrunableBranch {
  branch: string;
  evidence: MergeEvidence;
}

/** A branch left alone, and why. */
export interface KeptBranch {
  branch: string;
  state: "unmerged" | "unknown";
  reason?: string;
}

/** A branch excluded before any merge check, and why. */
export interface SkippedBranch {
  branch: string;
  reason: string;
}

/** Structured result returned in the tool's `details`. */
export interface PruneMergedBranchesResult {
  remote: string;
  /** Remote default branch ref, e.g. `origin/main`. */
  base: string;
  defaultBranch: string;
  dryRun: boolean;
  /** Every branch found merged, whether or not it was deleted. */
  prunable: PrunableBranch[];
  deleted: { branch: string; evidence: "ancestor" | "pr"; url?: string }[];
  kept: KeptBranch[];
  skipped: SkippedBranch[];
  failed: { branch: string; error: string }[];
  /** Present when merged-PR lookups were unavailable. */
  warning?: string;
}

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
async function resolveDefaultBranch(
  pi: ExtensionAPI,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<string | null> {
  const { stdout } = await pi.exec("git", ["symbolic-ref", "--short", `refs/remotes/${REMOTE}/HEAD`], { cwd, signal });
  const fromRemote = stdout.trim().replace(new RegExp(`^${REMOTE}/`), "");
  if (fromRemote && !fromRemote.startsWith("refs/")) return fromRemote;

  for (const candidate of TRUNK_BRANCHES) {
    const { code } = await pi.exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${candidate}`], {
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
async function loadMergedPrs(
  pi: ExtensionAPI,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<{ index: Map<string, string>; error?: string }> {
  const { code, stdout, stderr } = await pi.exec(
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

/**
 * Registers the `git_prune_merged_branches` tool.
 *
 * The tool lists local branches merged into `origin/<default>` and deletes
 * them after a confirmation dialog. Pass `dryRun: true` to preview the list
 * without confirming or deleting. Local branches only; origin is untouched.
 */
export function registerPruneMergedBranches(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "git_prune_merged_branches",
    label: "git_prune_merged_branches",
    description:
      "Find local branches already merged into the remote default branch and delete them. " +
      "Counts both ancestry of origin/<default> and merged pull requests (so squash merges are caught). " +
      "Skips the current branch, trunk branches, and branches checked out in other worktrees; " +
      "the user confirms the list before anything is deleted. Local branches only.",
    parameters: Type.Object({
      dryRun: Type.Optional(
        Type.Boolean({
          description: "Only list the prunable branches; never confirm or delete (default: false).",
        }),
      ),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const cwd = ctx.cwd;
      const dryRun = params.dryRun ?? false;

      const defaultBranch = await resolveDefaultBranch(pi, cwd, signal);
      if (!defaultBranch) {
        throw new Error(`Cannot determine the default branch: no ${REMOTE}/HEAD and no local trunk branch`);
      }
      const base = `${REMOTE}/${defaultBranch}`;

      const { code: baseExists } = await pi.exec(
        "git",
        ["show-ref", "--verify", "--quiet", `refs/remotes/${REMOTE}/${defaultBranch}`],
        { cwd, signal },
      );
      if (baseExists !== 0) {
        throw new Error(`Missing ${base} — run 'git fetch ${REMOTE}' first`);
      }

      // --- Read-only discovery ---------------------------------------------
      const { stdout: currentOut } = await pi.exec("git", ["symbolic-ref", "--short", "HEAD"], { cwd, signal });
      const { stdout: branchesOut } = await execOk(
        pi,
        "git",
        ["for-each-ref", "--format=%(refname:short)", "refs/heads"],
        cwd,
        signal,
        "git for-each-ref",
      );
      const { stdout: worktreesOut } = await pi.exec("git", ["worktree", "list", "--porcelain"], { cwd, signal });

      const { candidates, skipped } = selectCandidates(parseBranchList(branchesOut), {
        current: currentOut.trim(),
        trunk: TRUNK_BRANCHES,
        worktrees: parseWorktreeBranches(worktreesOut),
      });

      const { index: mergedPrs, error: ghError } = await loadMergedPrs(pi, cwd, signal);

      const prunable: PrunableBranch[] = [];
      const kept: KeptBranch[] = [];
      for (const branch of candidates) {
        const { code } = await pi.exec("git", ["merge-base", "--is-ancestor", branch, base], { cwd, signal });
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

      // --- Confirmation gate -----------------------------------------------
      if (!dryRun && prunable.length > 0) {
        const confirmed = await ctx.ui.confirm("Prune merged branches", buildConfirmMessage(prunable, base));
        if (!confirmed) {
          return {
            content: [{ type: "text", text: "Branch pruning cancelled by user." }],
            details: { cancelled: true } satisfies { cancelled: true },
          };
        }
      }

      // --- Deletion ---------------------------------------------------------
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
          const { code, stderr } = await pi.exec("git", ["branch", "-D", branch], { cwd, signal });
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

      return {
        content: [{ type: "text", text: buildSummary(result) }],
        details: result,
      };
    },
  });
}
