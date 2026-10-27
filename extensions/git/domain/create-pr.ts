/**
 * Pull-request state classification and message building.
 *
 * Everything here is pure: it maps `gh pr view` exit codes and output onto a
 * `PrState`, and renders confirmation text, without touching pi or the
 * filesystem.
 */

import type { PrState } from "./types.ts";

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
