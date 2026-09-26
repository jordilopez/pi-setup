/**
 * Tests for the pure classification logic of the git_classify_changes tool.
 *
 * Run with: node --experimental-strip-types --test tests/git-classify.test.ts
 *
 * The extension wires git output into classifyGitChanges(); these tests
 * exercise that pure function directly with fixture data, no git needed.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyGitChanges } from "../extensions/llm-tools/git-classify.ts";

describe("classifyGitChanges", () => {
  it("returns single mode for ≤3 files in one package with no mixed types", () => {
    const result = classifyGitChanges({
      statusLines: ["M  skills/jsdoc-docs/SKILL.md", "?? skills/jsdoc-docs/notes.md"],
      diffSample: "+/** New doc */\n+export const x = 1;\n",
    });

    assert.equal(result.mode, "single");
    assert.deepEqual(result.packageSet, ["skills/jsdoc-docs"]);
    assert.equal(result.fileCount, 2);
    assert.equal(result.recommendation, "SINGLE_COMMIT");
  });

  it("returns split_by_type when more than one commit type is inferred", () => {
    const result = classifyGitChanges({
      statusLines: ["M  package.json", "M  extensions/git/index.ts", "M  skills/jsdoc-docs/SKILL.md"],
      diffSample: "+feat(tooling): add helper\n+docs: explain usage\n+chore: bump lint config\n",
    });

    assert.equal(result.mode, "split_by_type");
    assert.ok(result.inferredTypes.length > 1);
    assert.equal(result.recommendation, "SPLIT_NEEDED");
  });

  it("returns split when more than one package is touched with a single type", () => {
    const result = classifyGitChanges({
      statusLines: ["M  extensions/git/index.ts", "M  extensions/redact/redact.ts"],
      diffSample: "+fix(redact): handle empty pattern\n+fix(git): guard detached HEAD\n",
    });

    assert.equal(result.mode, "split");
    assert.deepEqual(result.packageSet.sort(), ["extensions/git", "extensions/redact"].sort());
    assert.equal(result.recommendation, "SPLIT_NEEDED");
  });

  it("returns ambiguous for a lone root file with no inferable type", () => {
    const result = classifyGitChanges({
      statusLines: [" M random-file.txt"],
      diffSample: "",
    });

    assert.equal(result.mode, "ambiguous");
    assert.deepEqual(result.packageSet, ["root"]);
  });

  it("maps package roots via path conventions (skills/, extensions/, scripts/)", () => {
    const result = classifyGitChanges({
      statusLines: [
        "M  skills/frontend-tip/SKILL.md",
        "M  extensions/llm-tools/index.ts",
        "M  scripts/validate.ts",
        " M README.md",
      ],
      diffSample: "",
    });

    assert.deepEqual(
      result.packageSet.sort(),
      ["skills/frontend-tip", "extensions/llm-tools", "scripts", "root"].sort(),
    );
  });

  it("infers per-file commit types from diff headers when present", () => {
    const result = classifyGitChanges({
      statusLines: ["M  a.ts", "?? b.ts"],
      diffSample: "diff --git a/a.ts b/a.ts\n+feat: thing\n",
    });

    assert.equal(result.stagedOnly, true);
    assert.deepEqual(result.untracked, ["b.ts"]);
    assert.deepEqual(result.inferredTypes, [{ file: "a.ts", type: "feat" }]);
  });

  it("falls back to file-less type entries when the diff has no headers", () => {
    const result = classifyGitChanges({
      statusLines: ["M  a.ts"],
      diffSample: "+fix: handle empty input\n",
    });

    assert.deepEqual(result.inferredTypes, [{ file: null, type: "fix" }]);
  });

  it("recognises staged-only trees by the second column being blank", () => {
    const fullyStaged = classifyGitChanges({
      statusLines: ["M  a.ts", "?? b.ts"],
      diffSample: "+fix: thing\n",
    });
    assert.equal(fullyStaged.stagedOnly, true);

    const partiallyStaged = classifyGitChanges({
      statusLines: ["MM a.ts"],
      diffSample: "",
    });
    assert.equal(partiallyStaged.stagedOnly, false);
  });

  it("handles an empty working tree", () => {
    const clean = classifyGitChanges({ statusLines: [], diffSample: "" });
    assert.equal(clean.fileCount, 0);
    assert.deepEqual(clean.untracked, []);
    assert.deepEqual(clean.inferredTypes, []);
    assert.equal(clean.stagedOnly, false);
    assert.equal(clean.mode, "empty");
    assert.equal(clean.recommendation, "SINGLE_COMMIT");
  });
});
