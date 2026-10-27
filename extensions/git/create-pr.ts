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

import { execOk } from "./common.ts";
import { TRUNK_BRANCHES } from "./domain/branch-policy.ts";
import { BASE_CANDIDATES, buildConfirmMessage, classifyPrState } from "./domain/create-pr.ts";
import type { CreatePrResult, PrState } from "./domain/types.ts";

/**
 * Throws if `ref` is option-like or not a valid git ref branch name. `label`
 * names the offending argument in the error (e.g. "branch name").
 */
export async function assertValidRef(
  pi: ExtensionAPI,
  ref: string,
  label: string,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  const message = `Unsafe ${label}: '${ref}'`;
  if (ref.startsWith("-")) {
    throw new Error(message);
  }
  const { code } = await pi.exec("git", ["check-ref-format", "--branch", ref], { cwd, signal });
  if (code !== 0) {
    throw new Error(message);
  }
}

/**
 * Validates the current branch: present, not a trunk branch, a valid git ref,
 * and not option-like (so it can never be parsed as a flag by `gh`).
 */
export async function assertPrBranch(
  pi: ExtensionAPI,
  branch: string,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  if (!branch) {
    throw new Error("Not on a branch (detached HEAD?) — aborting");
  }
  if (TRUNK_BRANCHES.includes(branch)) {
    throw new Error(`Refusing to create a PR from trunk branch '${branch}'`);
  }
  await assertValidRef(pi, branch, "branch name", cwd, signal);
}

/**
 * Resolves the PR base branch from local branches, preferring `master` then
 * `main`. An explicit `base` argument wins but must be a valid git ref.
 */
export async function resolveBase(
  pi: ExtensionAPI,
  explicit: string | undefined,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  if (explicit) {
    await assertValidRef(pi, explicit, "base branch", cwd, signal);
    return explicit;
  }

  for (const candidate of BASE_CANDIDATES) {
    const { code } = await pi.exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${candidate}`], {
      cwd,
      signal,
    });
    if (code === 0) return candidate;
  }
  throw new Error("No `master` or `main` branch found — aborting");
}

/**
 * Reads the existing PR state for `branch` by running `gh pr view` and
 * classifying the result with {@link classifyPrState}.
 */
async function detectPrState(
  pi: ExtensionAPI,
  branch: string,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<PrState> {
  const { stdout, stderr, code } = await pi.exec("gh", ["pr", "view", branch, "--json", "state", "--jq", ".state"], {
    cwd,
    signal,
  });
  return classifyPrState(code, stdout, stderr);
}

/**
 * Pushes the current branch with `--force-with-lease`, setting the upstream on
 * the first push (detected via `@{u}`).
 */
async function pushBranch(
  pi: ExtensionAPI,
  remote: string | undefined,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  const { code: hasUpstream } = await pi.exec("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], {
    cwd,
    signal,
  });
  const args =
    hasUpstream === 0
      ? ["push", "--force-with-lease"]
      : ["push", "--force-with-lease", "--set-upstream", remote ?? "origin", "HEAD"];
  await execOk(pi, "git", args, cwd, signal, "git push");
}

/**
 * Creates or updates the PR through `gh`, passing the body via a `0600` file in
 * a private temp directory that is always removed.
 */
async function createOrEditPr(
  pi: ExtensionAPI,
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
    await execOk(pi, "gh", args, cwd, signal, existing ? "gh pr edit" : "gh pr create");
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

      if (!title.trim()) throw new Error("A non-empty PR title is required");
      if (!body.trim()) throw new Error("A non-empty PR body is required");

      // --- Read-only validation and state discovery -------------------------
      const { stdout: branchOut } = await execOk(
        pi,
        "git",
        ["branch", "--show-current"],
        cwd,
        signal,
        "git branch --show-current",
      );
      const branch = branchOut.trim();
      await assertPrBranch(pi, branch, cwd, signal);

      const base = await resolveBase(pi, explicitBase, cwd, signal);
      const prState = await detectPrState(pi, branch, cwd, signal);
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
        await pushBranch(pi, remote, cwd, signal);
        pushed = true;
      }

      await createOrEditPr(pi, { branch, base, title, body, existing }, cwd, signal);

      const { stdout: urlOut } = await execOk(
        pi,
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
