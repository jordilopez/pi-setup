/**
 * Git Create PR — `git_create_pr` tool
 *
 * Performs only the mechanical part of opening or updating a pull request:
 * validates the branch, pushes with `--force-with-lease`, and creates or edits
 * the PR through `gh`. The PR title and description are composed by the calling
 * skill/model and passed in as parameters.
 *
 * Creation is a two-step, confirmation-gated action:
 *  1. everything is validated and the existing PR state is read (read-only);
 *  2. the user confirms title/body/base before any push or `gh` mutation runs.
 *
 * All commands use argument arrays (no shell), and the PR body is written to a
 * `0600` file inside a private temp directory that is removed afterward.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { PiExecutor } from "./adapters/pi/executor.ts";
import { assertPrBranch, buildConfirmMessage, detectPrState, resolveBase } from "./domain/create-pr.ts";
import { execOk } from "./domain/exec.ts";
import type { CreatePrResult } from "./domain/types.ts";
import type { Executor } from "./ports/executor.ts";

/**
 * Pushes the current branch with `--force-with-lease`, setting the upstream on
 * the first push (detected via `@{u}`).
 */
async function pushBranch(
  executor: Executor,
  remote: string | undefined,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  const { code: hasUpstream } = await executor.run(
    "git",
    ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
    {
      cwd,
      signal,
    },
  );
  const args =
    hasUpstream === 0
      ? ["push", "--force-with-lease"]
      : ["push", "--force-with-lease", "--set-upstream", remote ?? "origin", "HEAD"];
  await execOk(executor, "git", args, cwd, signal, "git push");
}

/**
 * Creates or updates the PR through `gh`, passing the body via a `0600` file in
 * a private temp directory that is always removed.
 */
async function createOrEditPr(
  executor: Executor,
  options: { branch: string; base: string; title: string; body: string; existing: boolean },
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  const { branch, base, title, body, existing } = options;
  const dir = await mkdtemp(join(tmpdir(), "pi-create-pr-"));
  const bodyFile = join(dir, "body.md");
  try {
    await writeFile(bodyFile, body, { mode: 0o600 });
    const args = existing
      ? ["pr", "edit", branch, "--title", title, "--body-file", bodyFile]
      : ["pr", "create", "--base", base, "--head", branch, "--title", title, "--body-file", bodyFile];
    await execOk(executor, "gh", args, cwd, signal, existing ? "gh pr edit" : "gh pr create");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

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
      const { title, body, base: explicitBase, push = true } = params;
      const cwd = ctx.cwd;
      const executor = PiExecutor(pi);

      if (!title.trim()) throw new Error("A non-empty PR title is required");
      if (!body.trim()) throw new Error("A non-empty PR body is required");

      // --- Read-only validation and state discovery -------------------------
      const { stdout: branchOut } = await execOk(
        executor,
        "git",
        ["branch", "--show-current"],
        cwd,
        signal,
        "git branch --show-current",
      );
      const branch = branchOut.trim();
      await assertPrBranch(executor, branch, cwd, signal);

      const base = await resolveBase(executor, explicitBase, cwd, signal);
      const prState = await detectPrState(executor, branch, cwd, signal);
      if (prState.kind === "error") throw new Error(prState.message);

      const existing = prState.kind === "update";
      const { stdout: remoteOut } = await pi.exec("git", ["remote"], { cwd, signal });
      const remote = remoteOut
        .split("\n")
        .map((line) => line.trim())
        .find((line) => line.length > 0);

      // --- Confirmation gate ------------------------------------------------
      const confirmed = await ctx.ui.confirm(
        "Create pull request",
        buildConfirmMessage(branch, base, title, body, existing),
      );
      if (!confirmed) {
        return {
          content: [{ type: "text", text: "Pull request creation cancelled by user." }],
          details: { cancelled: true },
        };
      }

      // --- Push and create/update the PR -----------------------------------
      let pushed = false;
      if (push) {
        await pushBranch(executor, remote, cwd, signal);
        pushed = true;
      }

      await createOrEditPr(executor, { branch, base, title, body, existing }, cwd, signal);

      const { stdout: urlOut } = await execOk(
        executor,
        "gh",
        ["pr", "view", branch, "--json", "url", "--jq", ".url"],
        cwd,
        signal,
        "gh pr view (url)",
      );
      const url = urlOut.trim();

      const result: CreatePrResult = {
        url,
        branch,
        base,
        action: existing ? "updated" : "created",
        pushed,
      };

      const verb = existing ? "Updated" : "Created";
      return {
        content: [{ type: "text", text: `${verb} pull request: ${url}` }],
        details: result,
      };
    },
  });
}
