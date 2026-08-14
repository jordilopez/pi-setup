/**
 * Git End Branch — `/git:end-branch` command
 *
 * Finishes a feature branch: checks out the base branch (master, falling back
 * to main), merges the current branch into it, and deletes the current branch.
 * Uncommitted changes are stashed first and restored on the base branch.
 * Refuses to run on trunk branches (`master`, `main`, `develop`).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { TRUNK_BRANCHES, resolveBaseBranch } from "./common";

export function registerEndBranch(pi: ExtensionAPI): void {
  pi.registerCommand("git:end-branch", {
    description:
      "Merge the current branch into the base branch (master/main) and delete it — stashes and restores uncommitted changes, refuses trunk branches (master/main/develop)",
    handler: async (_args, ctx) => {
      // Step 1: Identify the current branch
      const { stdout: currentOut } = await pi.exec("git", [
        "branch",
        "--show-current",
      ]);
      const currentBranch = currentOut?.trim();

      if (!currentBranch) {
        ctx.ui.notify("Not on a branch (detached HEAD?) — aborting", "error");
        return;
      }

      // Step 2: Never end trunk branches
      if (TRUNK_BRANCHES.includes(currentBranch)) {
        ctx.ui.notify(
          `Refusing to end trunk branch "${currentBranch}" — checkout a feature branch first`,
          "error",
        );
        return;
      }

      // Step 3: Resolve the base branch (master preferred, main fallback)
      const base = resolveBaseBranch();
      if (!base) {
        ctx.ui.notify("No `master` or `main` branch found — aborting", "error");
        return;
      }

      // Step 4: Detect uncommitted changes (tracked and untracked)
      const { stdout: statusOut } = await pi.exec("git", [
        "status",
        "--porcelain",
      ]);
      const hasChanges = !!statusOut?.trim();

      if (hasChanges) {
        const proceed = await ctx.ui.confirm(
          "Uncommitted changes",
          `Uncommitted changes will be stashed, then restored on ${base} after the merge. Continue?`,
        );
        if (!proceed) {
          ctx.ui.notify("Cancelled", "info");
          return;
        }
      }

      // Step 5: Stash uncommitted changes (incl. untracked) so the checkout is clean
      let stashed = false;
      if (hasChanges) {
        const stash = await pi.exec("git", [
          "stash",
          "push",
          "-u",
          "-m",
          `git:end-branch: ${currentBranch}`,
        ]);
        if (stash.code !== 0) {
          ctx.ui.notify(
            `Could not stash changes:\n${stash.stderr?.trim()}`,
            "error",
          );
          return;
        }
        stashed = true;
      }

      // Step 6: Check out the base branch
      const checkout = await pi.exec("git", ["checkout", base]);
      if (checkout.code !== 0) {
        if (stashed) await pi.exec("git", ["stash", "pop"]);
        ctx.ui.notify(
          `Checkout of ${base} failed:\n${checkout.stderr?.trim()}`,
          "error",
        );
        return;
      }

      // Step 7: Merge the current branch into the base
      const merge = await pi.exec("git", ["merge", currentBranch]);
      if (merge.code !== 0) {
        // Abort a conflicted/incomplete merge first — popping the stash onto
        // an unresolved merge state would only add more conflicts
        const abort = await pi.exec("git", ["merge", "--abort"]);
        if (stashed) {
          await pi.exec("git", ["stash", "pop"]);
        }
        ctx.ui.notify(
          `Merge of ${currentBranch} into ${base} failed${abort.code === 0 ? ", merge aborted" : ""}:\n${merge.stderr?.trim()}`,
          "error",
        );
        return;
      }

      // Step 8: Delete the merged branch (safe `-d`, never force)
      const del = await pi.exec("git", ["branch", "-d", currentBranch]);
      if (del.code !== 0) {
        // Restore the stash first — otherwise the user's changes stay hidden
        let stashNote = "";
        if (stashed) {
          const pop = await pi.exec("git", ["stash", "pop"]);
          if (pop.code !== 0) {
            stashNote = `\nStashed changes could NOT be restored either — recover them with \`git stash list\` / \`git stash pop\`.`;
          }
        }
        ctx.ui.notify(
          `Merged but could not delete ${currentBranch}:\n${del.stderr?.trim()}${stashNote}`,
          "warning",
        );
        return;
      }

      // Step 9: Restore the stashed changes on the base branch
      if (stashed) {
        const pop = await pi.exec("git", ["stash", "pop"]);
        if (pop.code !== 0) {
          ctx.ui.notify(
            `✅ ${currentBranch} merged into ${base} and deleted, but stashed changes could not be restored automatically:\n${pop.stderr?.trim()}\nRecover them with \`git stash list\` / \`git stash pop\`.`,
            "warning",
          );
          return;
        }
      }

      ctx.ui.notify(
        `✅ ${currentBranch} merged into ${base} and deleted${
          stashed ? ", stashed changes restored" : ""
        }`,
        "success",
      );
    },
  });
}
