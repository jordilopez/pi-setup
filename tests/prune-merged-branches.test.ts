/**
 * Unit tests for the pure helpers in `extensions/git/prune-merged.ts`:
 * `parseBranchList`, `parseWorktreeBranches`, `parseMergedPrs`,
 * `selectCandidates`, `classifyMerge`, `buildConfirmMessage`, and
 * `buildSummary`.
 *
 * The critical properties under test: evidence from git ancestry and merged
 * PRs both count as merged, a failed `gh` call degrades to "unknown" instead
 * of "unmerged", non-0/1 `merge-base` exits are never read as "unmerged",
 * the current/trunk/worktree branches are never offered for deletion, and a
 * deletion failure is never summarized as a clean result.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildConfirmMessage,
  buildSummary,
  classifyMerge,
  parseBranchList,
  parseMergedPrs,
  parseWorktreeBranches,
  selectCandidates,
} from "../extensions/git/domain/prune-merged.ts";
import type { PrunableBranch, PruneMergedBranchesResult } from "../extensions/git/domain/types.ts";

describe("parseBranchList", () => {
  it("splits lines and drops blanks", () => {
    assert.deepEqual(parseBranchList("main\nfeat/a\n\n  chore/b  \n"), ["main", "feat/a", "chore/b"]);
  });

  it("returns an empty array for empty output", () => {
    assert.deepEqual(parseBranchList(""), []);
  });
});

describe("parseWorktreeBranches", () => {
  it("collects branches across worktrees and ignores detached ones", () => {
    const porcelain = [
      "worktree /repo",
      "HEAD abc123",
      "branch refs/heads/main",
      "",
      "worktree /repo-dependabot",
      "HEAD def456",
      "branch refs/heads/chore/dependabot-ci",
      "",
      "worktree /repo-detached",
      "HEAD 789abc",
      "detached",
      "",
    ].join("\n");

    assert.deepEqual(parseWorktreeBranches(porcelain), ["main", "chore/dependabot-ci"]);
  });

  it("returns an empty array when no worktree has a branch", () => {
    assert.deepEqual(parseWorktreeBranches("worktree /repo\nHEAD abc\ndetached\n"), []);
  });
});

describe("parseMergedPrs", () => {
  it("maps branch names to PR URLs", () => {
    const stdout = ["feat/a https://github.com/o/r/pull/1", "feat/b https://github.com/o/r/pull/2"].join("\n");
    const merged = parseMergedPrs(stdout);

    assert.equal(merged.get("feat/a"), "https://github.com/o/r/pull/1");
    assert.equal(merged.get("feat/b"), "https://github.com/o/r/pull/2");
    assert.equal(merged.size, 2);
  });

  it("ignores malformed and blank lines", () => {
    const merged = parseMergedPrs("\nfeat/a\n\nfeat/b https://github.com/o/r/pull/2\n");

    assert.equal(merged.has("feat/a"), false);
    assert.equal(merged.get("feat/b"), "https://github.com/o/r/pull/2");
    assert.equal(merged.size, 1);
  });

  it("keeps the first occurrence when a branch name repeats", () => {
    const merged = parseMergedPrs("feat/a https://github.com/o/r/pull/9\nfeat/a https://github.com/o/r/pull/1");

    assert.equal(merged.get("feat/a"), "https://github.com/o/r/pull/9");
  });
});

describe("selectCandidates", () => {
  const context = { current: "main", trunk: ["main", "master", "develop"], worktrees: ["chore/wt"] };

  it("keeps ordinary branches", () => {
    const { candidates, skipped } = selectCandidates(["feat/a", "fix/b"], context);

    assert.deepEqual(candidates, ["feat/a", "fix/b"]);
    assert.deepEqual(skipped, []);
  });

  it("skips the current branch, trunk branches, and worktree branches", () => {
    const { candidates, skipped } = selectCandidates(["main", "master", "develop", "chore/wt", "feat/a"], context);

    assert.deepEqual(candidates, ["feat/a"]);
    assert.deepEqual(skipped, [
      { branch: "main", reason: "current branch" },
      { branch: "master", reason: "trunk branch" },
      { branch: "develop", reason: "trunk branch" },
      { branch: "chore/wt", reason: "checked out in another worktree" },
    ]);
  });

  it("rejects option-like names and de-duplicates", () => {
    const { candidates, skipped } = selectCandidates(["-D", "feat/a", "feat/a"], context);

    assert.deepEqual(candidates, ["feat/a"]);
    assert.deepEqual(skipped, [{ branch: "-D", reason: "unsafe branch name" }]);
  });

  it("skips a branch named like the current one under any worktree context", () => {
    const { candidates } = selectCandidates(["feat/a"], { ...context, current: "feat/a" });

    assert.deepEqual(candidates, []);
  });
});

describe("classifyMerge", () => {
  it("treats an ancestor tip as merged", () => {
    assert.deepEqual(classifyMerge(0, undefined, undefined), { kind: "ancestor" });
  });

  it("treats a merged PR as merged even without ancestry", () => {
    assert.deepEqual(classifyMerge(1, "https://github.com/o/r/pull/7", undefined), {
      kind: "pr",
      url: "https://github.com/o/r/pull/7",
    });
  });

  it("reports unmerged when neither source has evidence", () => {
    assert.deepEqual(classifyMerge(1, undefined, undefined), { kind: "unmerged" });
  });

  it("reports unknown when gh is unavailable instead of guessing", () => {
    const evidence = classifyMerge(1, undefined, "gh pr list failed (exit 4): auth required");

    assert.equal(evidence.kind, "unknown");
    assert.match((evidence as { reason: string }).reason, /auth required/);
  });

  it("reports unknown for merge-base failures other than 0/1", () => {
    const evidence = classifyMerge(128, undefined, undefined);

    assert.equal(evidence.kind, "unknown");
    assert.match((evidence as { reason: string }).reason, /exit 128/);
  });

  it("prefers ancestry over a failed gh lookup", () => {
    assert.deepEqual(classifyMerge(0, undefined, "gh pr list failed (exit 4)"), { kind: "ancestor" });
  });
});

describe("buildConfirmMessage", () => {
  it("lists branches with the evidence that justifies each one", () => {
    const prunable: PrunableBranch[] = [
      { branch: "feat/a", evidence: { kind: "ancestor" } },
      { branch: "feat/b", evidence: { kind: "pr", url: "https://github.com/o/r/pull/2" } },
    ];

    const message = buildConfirmMessage(prunable, "origin/main");

    assert.match(message, /Delete 2 local branch\(es\) already merged into origin\/main\?/);
    assert.match(message, /feat\/a \(ancestor of the base\)/);
    assert.match(message, /feat\/b \(merged PR https:\/\/github\.com\/o\/r\/pull\/2\)/);
    assert.match(message, /origin is untouched/);
  });

  it("truncates long lists", () => {
    const prunable: PrunableBranch[] = Array.from({ length: 25 }, (_, index) => ({
      branch: `feat/${index}`,
      evidence: { kind: "ancestor" } as const,
    }));

    const message = buildConfirmMessage(prunable, "origin/main");

    assert.match(message, /Delete 25 local branch\(es\)/);
    assert.match(message, /…and 5 more/);
    assert.doesNotMatch(message, /feat\/24/);
  });
});

describe("buildSummary", () => {
  const base = "origin/main";
  const ancestorEvidence = { kind: "ancestor" } as const;
  const prunable: PrunableBranch[] = [
    { branch: "feat/a", evidence: ancestorEvidence },
    { branch: "feat/b", evidence: ancestorEvidence },
  ];

  function makeResult(overrides: Partial<PruneMergedBranchesResult>): PruneMergedBranchesResult {
    return {
      remote: "origin",
      base,
      defaultBranch: "main",
      dryRun: false,
      prunable: [],
      deleted: [],
      kept: [],
      skipped: [],
      failed: [],
      ...overrides,
    };
  }

  it("reports the dry-run list without claiming deletions", () => {
    const summary = buildSummary(makeResult({ dryRun: true, prunable }));

    assert.match(summary, /2 local branch\(es\) merged into origin\/main/);
    assert.match(summary, /Dry run — nothing deleted\./);
  });

  it("reports a clean no-op when nothing is merged", () => {
    assert.equal(buildSummary(makeResult({})), "No local branches merged into origin/main.");
  });

  it("reports partial deletion with the deleted branches only", () => {
    const summary = buildSummary(
      makeResult({
        prunable,
        deleted: [{ branch: "feat/a", evidence: "ancestor" }],
        failed: [{ branch: "feat/b", error: "branch is checked out" }],
      }),
    );

    assert.match(summary, /Deleted 1 of 2 local branch\(es\) merged into origin\/main:/);
    assert.match(summary, /• feat\/a/);
    assert.doesNotMatch(summary, /• feat\/b/);
    assert.match(summary, /Failed to delete: feat\/b/);
  });

  it("does not claim a clean result when every deletion failed", () => {
    const summary = buildSummary(
      makeResult({
        prunable,
        failed: [
          { branch: "feat/a", error: "boom" },
          { branch: "feat/b", error: "boom" },
        ],
      }),
    );

    assert.match(summary, /Deleted 0 of 2 local branch\(es\) merged into origin\/main\./);
    assert.doesNotMatch(summary, /No local branches merged/);
    assert.match(summary, /Failed to delete: feat\/a, feat\/b/);
  });

  it("surfaces the degraded-lookup warning", () => {
    const summary = buildSummary(makeResult({ warning: "merged-PR lookup unavailable, using ancestry only" }));

    assert.match(summary, /No local branches merged into origin\/main\./);
    assert.match(summary, /Note: merged-PR lookup unavailable/);
  });
});
