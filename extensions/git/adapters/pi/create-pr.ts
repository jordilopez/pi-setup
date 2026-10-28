/**
 * `git_create_pr` adapter: registers the tool and drives the domain's
 * `runCreatePrPlan` through the Pi-backed ports.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { runCreatePrPlan } from "../../domain/create-pr.ts";
import { PiUi } from "../pi/ui.ts";
import { TempBodyFileStore } from "./body-file.ts";
import { PiExecutor } from "./executor.ts";

/**
 * Registers the `git_create_pr` tool.
 *
 * The tool requires the caller to compose the PR `title` and `body` and to
 * provide an optional `base` (defaults to local `master`, then `main`) and
 * `push` (default true, `--force-with-lease`). Nothing is pushed or sent to
 * GitHub until the user approves the confirmation dialog the tool shows.
 */
export function registerCreatePr(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "git_create_pr",
    label: "git_create_pr",
    description:
      "Push the current branch and create or update its pull request. " +
      "The caller composes the PR title and description; this tool handles " +
      "branch validation, force-with-lease push, and `gh pr create`/`gh pr edit`. " +
      "The user confirms the title/body/base before anything is pushed.",
    parameters: Type.Object({
      title: Type.String({
        description: "PR title. The caller composes this.",
      }),
      body: Type.String({
        description: "PR description in Markdown. The caller composes this.",
      }),
      base: Type.Optional(
        Type.String({
          description: "Base branch to target. Defaults to the local 'master', then 'main'.",
        }),
      ),
      push: Type.Optional(
        Type.Boolean({
          description: "Push the branch with --force-with-lease before creating the PR (default: true).",
        }),
      ),
    }),

    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { title, body, base, push = true } = params;

      const outcome = await runCreatePrPlan(PiExecutor(pi), PiUi(ctx.ui), TempBodyFileStore(), {
        title,
        body,
        base,
        push,
        cwd: ctx.cwd,
        signal,
      });

      if (outcome.kind === "cancelled") {
        return {
          content: [{ type: "text", text: "Pull request creation cancelled by user." }],
          details: { cancelled: true },
        };
      }

      const { result } = outcome;
      const verb = result.action === "updated" ? "Updated" : "Created";
      return {
        content: [{ type: "text", text: `${verb} pull request: ${result.url}` }],
        details: result,
      };
    },
  });
}
