/**
 * Pull-request state classification, validation, and message building.
 *
 * Pure with respect to pi: the PR-state classifier and confirmation renderer
 * are unit-testable without any adapter, and the validators/readers reach git
 * only through the `Executor` port.
 */

import type { BodyFileStore } from "../ports/body-file.ts";
import type { Executor } from "../ports/executor.ts";
import type { Ui } from "../ports/ui.ts";
import { TRUNK_BRANCHES } from "./branch-policy.ts";
import { execOk } from "./exec.ts";
import type { CreatePrResult, PrState } from "./types.ts";

/** `gh pr view` reports this wording when the branch simply has no PR yet. */
export const GH_NO_PR_PATTERN = /no\s+pull\s+requests?/i;

/** Base branch candidates, in preference order. */
export const BASE_CANDIDATES = ["master", "main"];

/** Maximum description characters shown in the confirmation dialog. */
export const BODY_PREVIEW_LIMIT = 1500;

/**
 * Classifies a `gh pr view --json state --jq .state` run into a {@link PrState}.
 * Pure so the exit-code and error-wording handling can be unit-tested.
 *
 * A code-1 "no pull requests" failure is a normal "none"; every other `gh`
 * failure is an error so auth or network problems never get mistaken for
 * "create a new PR".
 */
export function classifyPrState(code: number, stdout: string, stderr: string): PrState {
  if (code === 0) {
    const state = stdout.trim().toUpperCase();
    if (state === "OPEN" || state === "DRAFT") return { kind: "update" };
    if (state === "MERGED" || state === "CLOSED") return { kind: "recreate" };
    return { kind: "error", message: `Unexpected PR state from gh pr view: '${state || "(empty)"}'` };
  }

  if (code === 1 && GH_NO_PR_PATTERN.test(stderr)) {
    return { kind: "none" };
  }

  return {
    kind: "error",
    message: `gh pr view failed (exit ${code}): ${stderr.trim() || stdout.trim() || "no output"}`,
  };
}

/**
 * Builds the pre-push confirmation dialog text, truncating the body preview.
 */
export function buildConfirmMessage(
  branch: string,
  base: string,
  title: string,
  body: string,
  existing: boolean,
): string {
  const preview = body.length > BODY_PREVIEW_LIMIT ? `${body.slice(0, BODY_PREVIEW_LIMIT)}\n…(truncated)` : body;
  const action = existing ? `Update the open PR for '${branch}'` : `Create a pull request for '${branch}'`;
  return `${action} targeting '${base}'.\n\nTitle: ${title}\n\n${preview}`;
}

/**
 * Throws if `ref` is option-like or not a valid git ref branch name. `label`
 * names the offending argument in the error (e.g. "branch name").
 */
export async function assertValidRef(
  executor: Executor,
  ref: string,
  label: string,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  const message = `Unsafe ${label}: '${ref}'`;
  if (ref.startsWith("-")) {
    throw new Error(message);
  }
  const { code } = await executor.run("git", ["check-ref-format", "--branch", ref], { cwd, signal });
  if (code !== 0) {
    throw new Error(message);
  }
}

/**
 * Validates the current branch: present, not a trunk branch, a valid git ref,
 * and not option-like (so it can never be parsed as a flag by `gh`).
 */
export async function assertPrBranch(
  executor: Executor,
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
  await assertValidRef(executor, branch, "branch name", cwd, signal);
}

/**
 * Resolves the PR base branch from local branches, preferring `master` then
 * `main`. An explicit `base` argument wins but must be a valid git ref.
 */
export async function resolveBase(
  executor: Executor,
  explicit: string | undefined,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  if (explicit) {
    await assertValidRef(executor, explicit, "base branch", cwd, signal);
    return explicit;
  }

  for (const candidate of BASE_CANDIDATES) {
    const { code } = await executor.run("git", ["show-ref", "--verify", "--quiet", `refs/heads/${candidate}`], {
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
export async function detectPrState(
  executor: Executor,
  branch: string,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<PrState> {
  const { stdout, stderr, code } = await executor.run(
    "gh",
    ["pr", "view", branch, "--json", "state", "--jq", ".state"],
    { cwd, signal },
  );
  return classifyPrState(code, stdout, stderr);
}

/** Input for {@link runCreatePrPlan}. */
export interface CreatePrInput {
  title: string;
  body: string;
  /** Explicit base branch; resolves to `master` then `main` when omitted. */
  base?: string;
  /** Whether to push the branch before creating/updating the PR. */
  push: boolean;
  cwd: string;
  signal?: AbortSignal;
}

/** Outcome of a `git_create_pr` run: either the user cancelled or it landed. */
export type CreatePrOutcome = { kind: "cancelled" } | { kind: "done"; result: CreatePrResult };

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
    { cwd, signal },
  );
  const args =
    hasUpstream === 0
      ? ["push", "--force-with-lease"]
      : ["push", "--force-with-lease", "--set-upstream", remote ?? "origin", "HEAD"];
  await execOk(executor, "git", args, cwd, signal, "git push");
}

/**
 * Creates or updates the PR through `gh`, passing the body via a temporary file
 * from the `BodyFileStore` port that is always disposed.
 */
async function createOrEditPr(
  executor: Executor,
  bodyFiles: BodyFileStore,
  options: { branch: string; base: string; title: string; body: string; existing: boolean },
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  const { branch, base, title, body, existing } = options;
  const handle = await bodyFiles.write(body);
  try {
    const args = existing
      ? ["pr", "edit", branch, "--title", title, "--body-file", handle.path]
      : ["pr", "create", "--base", base, "--head", branch, "--title", title, "--body-file", handle.path];
    await execOk(executor, "gh", args, cwd, signal, existing ? "gh pr edit" : "gh pr create");
  } finally {
    await handle.dispose();
  }
}

/**
 * Runs the full `git_create_pr` flow: validate the branch, resolve the base,
 * detect existing PR state, ask the user to confirm, then push and
 * create/update the PR. All I/O goes through the `Executor`, `Ui`, and
 * `BodyFileStore` ports.
 */
export async function runCreatePrPlan(
  executor: Executor,
  ui: Ui,
  bodyFiles: BodyFileStore,
  input: CreatePrInput,
): Promise<CreatePrOutcome> {
  const { title, body, base: explicitBase, push, cwd, signal } = input;

  if (!title.trim()) throw new Error("A non-empty PR title is required");
  if (!body.trim()) throw new Error("A non-empty PR body is required");

  // --- Read-only validation and state discovery ---------------------------
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
  const { stdout: remoteOut } = await executor.run("git", ["remote"], { cwd, signal });
  const remote = remoteOut
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  // --- Confirmation gate --------------------------------------------------
  const confirmed = await ui.confirm("Create pull request", buildConfirmMessage(branch, base, title, body, existing));
  if (!confirmed) return { kind: "cancelled" };

  // --- Push and create/update the PR --------------------------------------
  let pushed = false;
  if (push) {
    await pushBranch(executor, remote, cwd, signal);
    pushed = true;
  }

  await createOrEditPr(executor, bodyFiles, { branch, base, title, body, existing }, cwd, signal);

  const { stdout: urlOut } = await execOk(
    executor,
    "gh",
    ["pr", "view", branch, "--json", "url", "--jq", ".url"],
    cwd,
    signal,
    "gh pr view (url)",
  );

  return {
    kind: "done",
    result: {
      url: urlOut.trim(),
      branch,
      base,
      action: existing ? "updated" : "created",
      pushed,
    },
  };
}
