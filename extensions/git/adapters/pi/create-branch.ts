/**
 * `/git:create-branch` adapter: registers the interactive command and drives
 * the domain's discovery + decide/run flow through the `PiExecutor` port and
 * the raw `ctx.ui` surface.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { toKebabCase } from "../../domain/branch-policy.ts";
import {
  decideCreateBranch,
  detectDefaultBranch,
  getExistingTrunkBranches,
  runCreateBranchPlan,
} from "../../domain/create-branch.ts";
import { PiExecutor } from "./executor.ts";

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

      // Step 4: Decide (validate) then run the checkout. decideCreateBranch
      // refuses trunk names and unsafe names; runCreateBranchPlan interprets
      // git failures (e.g. "already exists") as clear errors.
      try {
        await runCreateBranchPlan(executor, decideCreateBranch({ branchName, baseRef, cwd: ctx.cwd }), ctx.signal);
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
