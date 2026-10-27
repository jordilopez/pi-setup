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

import { PiExecutor } from "./adapters/pi/executor.ts";
import { TRUNK_BRANCHES } from "./domain/branch-policy.ts";
import { execOk } from "./domain/exec.ts";
import {
  buildConfirmMessage,
  buildSummary,
  classifyMerge,
  loadMergedPrs,
  parseBranchList,
  parseWorktreeBranches,
  REMOTE,
  resolveDefaultBranch,
  selectCandidates,
} from "./domain/prune-merged.ts";
import type { KeptBranch, PrunableBranch, PruneMergedBranchesResult } from "./domain/types.ts";

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
      const executor = PiExecutor(pi);

      const defaultBranch = await resolveDefaultBranch(executor, cwd, signal);
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
        executor,
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

      const { index: mergedPrs, error: ghError } = await loadMergedPrs(executor, cwd, signal);

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
