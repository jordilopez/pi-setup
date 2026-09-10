/**
 * Git Create PR — `/git:create-pr` command
 *
 * The command remains the interactive Pi wrapper: it confirms dirty checkouts,
 * pushes with Pi's process runner, and reports progress in the UI. The
 * reusable PR mechanics live in `scripts/create-pr.ts`, which is also
 * callable through `scripts/create-pr.sh` from skills and shell sessions.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createPr, type CreatePrOptions, type CreatePrResult } from "../../scripts/create-pr.ts";
import { TRUNK_BRANCHES, buildPushArgs, resolveBaseBranch } from "./common.ts";

// Keep the helper's public exports available to callers that used to import
// them from the extension module.
export { createPr };
export type { CreatePrOptions, CreatePrResult };

export function registerCreatePr(pi: ExtensionAPI): void {
  pi.registerCommand("git:create-pr", {
    description:
      "Push the current branch and create or update its PR against the base branch (master/main). Title is the branch name. Optional arg: path to a summary file (used as the PR body)",
    handler: async (args, ctx) => {
      // Optional argument: path to a summary file used as the PR body (the
      // last argument wins, so legacy two-argument calls still resolve).
      const summaryFile = args.trim().split(/\s+/).filter(Boolean).pop();

      // Step 1: Identify the current branch and resolve the base
      const { stdout: currentOut } = await pi.exec("git", ["branch", "--show-current"]);
      const currentBranch = currentOut?.trim();
      if (!currentBranch) {
        ctx.ui.notify("Not on a branch (detached HEAD?) — aborting", "error");
        return;
      }

      if (TRUNK_BRANCHES.includes(currentBranch)) {
        ctx.ui.notify(`Refusing to create a PR from trunk branch "${currentBranch}"`, "error");
        return;
      }

      const base = resolveBaseBranch();
      if (!base) {
        ctx.ui.notify("No `master` or `main` branch found — aborting", "error");
        return;
      }

      // Step 2: Warn about uncommitted changes (push only includes commits)
      const { stdout: statusOut } = await pi.exec("git", ["status", "--porcelain"]);
      if (statusOut?.trim()) {
        const proceed = await ctx.ui.confirm(
          "Uncommitted changes",
          "There are uncommitted changes — they will NOT be included in the push. Continue?",
        );
        if (!proceed) {
          ctx.ui.notify("Cancelled", "info");
          return;
        }
      }

      // Step 3: Push the branch
      // A branch created by /git:create-branch has no upstream yet, and a
      // plain `push` fails with "no upstream". Detect the remote and any
      // existing upstream: first push uses --set-upstream <remote> HEAD;
      // subsequent pushes reuse the configured upstream.
      const { stdout: remoteOut } = await pi.exec("git", ["remote"]);
      const remote =
        (remoteOut ?? "")
          .split(/\s+/)
          .map((s) => s.trim())
          .find(Boolean) || "origin";
      const upstream = await pi.exec("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
      const hasUpstream = upstream.code === 0 && !!upstream.stdout?.trim();
      const pushArgs = buildPushArgs(hasUpstream, remote);
      ctx.ui.notify(`Pushing ${currentBranch}...`, "info");
      const push = await pi.exec("git", pushArgs, {
        timeout: 120_000,
      });
      if (push.code !== 0) {
        ctx.ui.notify(`Push failed:\n${push.stderr?.trim() || push.stdout?.trim()}`, "error");
        return;
      }

      // Step 4: Create or update the PR
      ctx.ui.notify("Creating/updating PR...", "info");
      try {
        const result = createPr({
          branchName: currentBranch,
          base,
          summaryFile,
          cwd: process.cwd(),
        });
        ctx.ui.notify(
          `✅ PR ${result.action}${result.prUrl ? `: ${result.prUrl}` : ""} (${currentBranch} → ${base})`,
          "info",
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`PR creation failed:\n${msg}`, "error");
      }
    },
  });
}
