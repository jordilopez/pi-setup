/**
 * Domain vocabulary for the git extension.
 *
 * These are the names and shapes the domain reasons about, independent of
 * any adapter. Nothing here imports from `@earendil-works/pi-coding-agent`
 * or from side-effectful `node:*` modules.
 */

/** Options for creating a regular feature branch from a base ref. */
export interface CreateBranchOptions {
  branchName: string;
  /** Base ref to branch from, e.g. "master", "main", or "HEAD". */
  baseRef: string;
  /** Repository directory the branch is created in. */
  cwd: string;
}

/** Identity of a branch produced by the create-branch flow. */
export interface CreateBranchResult {
  branchName: string;
  baseRef: string;
  cwd: string;
}

/** Result of a successful `git_create_pr` call. */
export interface CreatePrResult {
  /** URL of the created or updated pull request. */
  url: string;
  /** Source branch. */
  branch: string;
  /** Base branch the PR targets. */
  base: string;
  /** Whether a new PR was created or an existing one updated. */
  action: "created" | "updated";
  /** Whether the branch was pushed as part of this call. */
  pushed: boolean;
}

/** How the current branch maps onto an existing PR, if any. */
export type PrState = { kind: "none" } | { kind: "update" } | { kind: "recreate" } | { kind: "error"; message: string };

/** What we know about one branch's merge status. */
export type MergeEvidence =
  { kind: "ancestor" } | { kind: "pr"; url: string } | { kind: "unmerged" } | { kind: "unknown"; reason: string };

/** Branch worth deleting, paired with the evidence that justified it. */
export interface PrunableBranch {
  branch: string;
  evidence: MergeEvidence;
}

/** A branch left alone, and why. */
export interface KeptBranch {
  branch: string;
  state: "unmerged" | "unknown";
  reason?: string;
}

/** A branch excluded before any merge check, and why. */
export interface SkippedBranch {
  branch: string;
  reason: string;
}

/** Structured result returned in the tool's `details`. */
export interface PruneMergedBranchesResult {
  remote: string;
  /** Remote default branch ref, e.g. `origin/main`. */
  base: string;
  defaultBranch: string;
  dryRun: boolean;
  /** Every branch found merged, whether or not it was deleted. */
  prunable: PrunableBranch[];
  deleted: { branch: string; evidence: "ancestor" | "pr"; url?: string }[];
  kept: KeptBranch[];
  skipped: SkippedBranch[];
  failed: { branch: string; error: string }[];
  /** Present when merged-PR lookups were unavailable. */
  warning?: string;
}
