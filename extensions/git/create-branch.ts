/**
 * Git Create Branch — `/git:create-branch` command
 *
 * Interactively creates a new branch: detects the repo's trunk branches
 * (master/main/develop) and its real default branch (via origin/HEAD), lets
 * the user pick the base, and converts the name to kebab-case. The actual
 * `git checkout -b` step is delegated to the shared `createBranch()` helper
 * in `common.ts`.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { PiExecutor } from "./adapters/pi/executor.ts";
import { createBranch } from "./common.ts";
import { toKebabCase } from "./domain/branch-policy.ts";
import { detectDefaultBranch, getExistingTrunkBranches } from "./domain/create-branch.ts";

export function registerCreateBranch(pi: ExtensionAPI): void {
  pi.registerCommand("git:create-branch", {
    description: "Interactively create a new git branch",
    handler: async (_args, ctx) => {
      const executor = PiExecutor(pi);

      // Step 1: Detect trunk branches and pick the base
      const trunks = await getExistingTrunkBranches(executor, ctx.cwd, ctx.signal);
      const defaultBranch = (await detectDefaultBranch(executor, ctx.cwd, ctx.signal)) ?? trunks[0] ?? null;

      const source = await ctx.ui.select("Start from which branch?", [
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

      // Step 3: Confirm before creating
      const confirmed = await ctx.ui.confirm(
        "Create branch",
        `Create branch "${branchName}" from ${fromCurrent ? "the current branch" : baseRef}?`,
      );

      if (!confirmed) {
        ctx.ui.notify("Cancelled", "info");
        return;
      }

      // Step 4: Create the branch via the shared helper (validates the name,
      // refuses trunk branches, and surfaces git failures as clear errors)
      try {
        createBranch({
          branchName,
          baseRef,
          cwd: ctx.cwd,
        });
        ctx.ui.notify(
          `Branch "${branchName}" created successfully from ${fromCurrent ? "the current branch" : baseRef}`,
          "info",
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Failed to create branch: ${msg}`, "error");
      }
    },
  });
}
