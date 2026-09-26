/**
 * Tests for the pure skeleton-building logic of the pr_skeleton tool.
 *
 * Run with: node --experimental-strip-types --test tests/pr-skeleton.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSkeleton, TRUNK_BRANCHES } from "../extensions/llm-tools/pr-skeleton.ts";

describe("buildSkeleton", () => {
  it("returns the branch name as titleStub and the commit subjects", () => {
    const result = buildSkeleton({
      branch: "feat/token-tools",
      baseRef: "origin/main",
      commitSubjects: ["feat: add classify tool", "docs: teach skill"],
      diffStatLines: [
        " extensions/llm-tools/git-classify.ts | 200 +++++++++",
        " skills/git-quick-commit/SKILL.md  | 10 +",
      ],
    });

    assert.equal(result.titleStub, "feat/token-tools");
    assert.deepEqual(result.commitSubjects, ["feat: add classify tool", "docs: teach skill"]);
    assert.equal(result.baseRef, "origin/main");
  });

  it("groups diff stat lines by package", () => {
    const result = buildSkeleton({
      branch: "feat/x",
      baseRef: "origin/main",
      commitSubjects: [],
      diffStatLines: [
        " extensions/llm-tools/a.ts | 10 +++",
        " extensions/llm-tools/b.ts |  2 +",
        " skills/demo/SKILL.md      |  5 +",
      ],
    });

    assert.equal(result.fileGroups.length, 2);
    assert.equal(result.fileGroups[0].package, "extensions/llm-tools");
    assert.equal(result.fileGroups[0].files.length, 2);
    assert.equal(result.fileGroups[0].insertions + result.fileGroups[0].deletions > 0, true);
    assert.equal(result.fileGroups[1].package, "skills/demo");
  });

  it("extracts per-package totals from diff stat numbers", () => {
    const result = buildSkeleton({
      branch: "feat/x",
      baseRef: "origin/main",
      commitSubjects: [],
      diffStatLines: [" extensions/llm-tools/a.ts | 10 +++++-----"],
    });

    assert.equal(result.fileGroups[0].insertions, 5);
    assert.equal(result.fileGroups[0].deletions, 5);
  });

  it("refuses trunk branches with a trunk_branch error", () => {
    for (const branch of TRUNK_BRANCHES) {
      const result = buildSkeleton({ branch, baseRef: "origin/main", commitSubjects: [], diffStatLines: [] });
      assert.equal(result.error, "trunk_branch");
    }
  });

  it("handles an empty diff", () => {
    const result = buildSkeleton({
      branch: "feat/empty",
      baseRef: "origin/main",
      commitSubjects: [],
      diffStatLines: [],
    });
    assert.deepEqual(result.fileGroups, []);
    assert.equal(result.error, undefined);
  });
});
