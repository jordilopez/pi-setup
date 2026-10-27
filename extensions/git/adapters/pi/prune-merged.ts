/**
 * `git_prune_merged_branches` adapter: registers the tool and drives the
 * domain's `runPrunePlan` through the Pi-backed ports.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { buildSummary, runPrunePlan } from "../../domain/prune-merged.ts";
import { PiUi } from "./ui.ts";
import { PiExecutor } from "./executor.ts";

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
      const outcome = await runPrunePlan(PiExecutor(pi), PiUi(ctx.ui), {
        cwd: ctx.cwd,
        signal,
        dryRun: params.dryRun ?? false,
      });

      if (outcome.kind === "cancelled") {
        return {
          content: [{ type: "text", text: "Branch pruning cancelled by user." }],
          details: { cancelled: true },
        };
      }

      return {
        content: [{ type: "text", text: buildSummary(outcome.result) }],
        details: outcome.result,
      };
    },
  });
}
