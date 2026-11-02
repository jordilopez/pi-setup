/**
 * `/git:create-worktree` adapter: registers the interactive command and drives
 * the domain's discovery + path resolution + decide/run flow through the
 * `PiExecutor` port and the raw `ctx.ui` surface.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { toKebabCase } from "../../domain/branch-policy.ts";
import { detectDefaultBranch, getExistingTrunkBranches } from "../../domain/create-branch.ts";
import {
  decideCreateWorktree,
  defaultWorktreePath,
  getRepoRoot,
  resolveWorktreePath,
  runCreateWorktreePlan,
} from "../../domain/create-worktree.ts";
import { PiExecutor } from "./executor.ts";

export function registerCreateWorktree(pi: ExtensionAPI): void {
  pi.registerCommand("git:create-worktree", {
    description: "Interactively create a git worktree on a new branch",
    handler: async (_args, ctx) => {
      const executor = PiExecutor(pi);

      // Step 1: Find the repo root (ctx.cwd may be a subdirectory) and the
      // available trunk branches, then pick the base for the new branch.
      const repoRoot = await getRepoRoot(executor, ctx.cwd, ctx.signal);
      const trunks = await getExistingTrunkBranches(executor, repoRoot, ctx.signal);
      const defaultBranch = (await detectDefaultBranch(executor, repoRoot, ctx.signal)) ?? trunks[0] ?? null;

      const source = await ctx.ui.select("Start the worktree branch from which branch?", [
        ...trunks.map((t) => (t === defaultBranch ? `${t} (default)` : t)),
        "current branch",
      ]);

      if (!source) {
        ctx.ui.notify("Cancelled", "info");
        return;
      }

      const fromCurrent = source === "current branch";
      const baseRef = fromCurrent ? "HEAD" : source.replace(" (default)", "");

      // Step 2: Enter branch name
      const rawName = await ctx.ui.input("Enter branch name (will be converted to kebab-case):");

      if (!rawName || !rawName.trim()) {
        ctx.ui.notify("Cancelled — no name provided", "info");
        return;
      }

      const branchName = toKebabCase(rawName);

      if (!branchName) {
        ctx.ui.notify("Invalid branch name after conversion", "error");
        return;
      }

      // Step 3: Enter the worktree path. Empty input accepts the suggested
      // sibling directory; `undefined` is the cancellation signal.
      const suggested = defaultWorktreePath(repoRoot, branchName);
      const rawPath = await ctx.ui.input(`Worktree path (empty for ${suggested}):`);

      if (rawPath === undefined) {
        ctx.ui.notify("Cancelled", "info");
        return;
      }

      // Step 4: Confirm the resolved absolute destination before creating
      let worktreePath: string;
      try {
        worktreePath = resolveWorktreePath(rawPath.trim() || suggested, repoRoot);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Invalid worktree path: ${msg}`, "error");
        return;
      }

      const confirmed = await ctx.ui.confirm(
        "Create worktree",
        `Create worktree at ${worktreePath} on new branch "${branchName}" from ` +
          `${fromCurrent ? "the current branch" : baseRef}?`,
      );

      if (!confirmed) {
        ctx.ui.notify("Cancelled", "info");
        return;
      }

      // Step 5: Decide (validate) then run `git worktree add`.
      // decideCreateWorktree refuses trunk/unsafe names and non-absolute paths;
      // runCreateWorktreePlan interprets git failures (existing branch, existing
      // path, branch checked out elsewhere) as clear errors.
      try {
        await runCreateWorktreePlan(
          executor,
          decideCreateWorktree({ branchName, baseRef, path: worktreePath, cwd: repoRoot }),
          ctx.signal,
        );
        ctx.ui.notify(
          `Worktree created at ${worktreePath} on branch "${branchName}" from ` +
            `${fromCurrent ? "the current branch" : baseRef} — cd "${worktreePath}" to start working`,
          "info",
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Failed to create worktree: ${msg}`, "error");
      }
    },
  });
}
