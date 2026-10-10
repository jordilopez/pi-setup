/**
 * Unit tests for `classifyPrState` in `extensions/git/create-pr.ts`.
 *
 * The classifier maps `gh pr view --json state --jq .state` runs onto PR
 * actions. The critical property under test: a "no pull requests" failure
 * (exit 1) is a normal "none", while every other `gh` failure — auth, network,
 * malformed state — must surface as an error so a real failure is never
 * mistaken for "the branch has no PR yet, create one".
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { classifyPrState } from "../extensions/git/create-pr.ts";

describe("classifyPrState", () => {
  describe("successful gh run (code 0)", () => {
    it("classifies OPEN as update", () => {
      assert.deepEqual(classifyPrState(0, "OPEN\n", ""), { kind: "update" });
    });

    it("classifies DRAFT as update", () => {
      assert.deepEqual(classifyPrState(0, "DRAFT\n", ""), { kind: "update" });
    });

    it("classifies MERGED as recreate", () => {
      assert.deepEqual(classifyPrState(0, "MERGED\n", ""), { kind: "recreate" });
    });

    it("classifies CLOSED as recreate", () => {
      assert.deepEqual(classifyPrState(0, "CLOSED\n", ""), { kind: "recreate" });
    });

    it("is case-insensitive and tolerant of whitespace", () => {
      assert.deepEqual(classifyPrState(0, "  open  \n", ""), { kind: "update" });
      assert.deepEqual(classifyPrState(0, "closed", ""), { kind: "recreate" });
    });

    it("reports an unexpected state with the raw value", () => {
      const result = classifyPrState(0, "UNKNOWN\n", "");
      assert.equal(result.kind, "error");
      assert.match(result.message, /Unexpected PR state from gh pr view: 'UNKNOWN'/);
    });

    it("shows '(empty)' when the state value is missing", () => {
      const result = classifyPrState(0, "\n", "");
      assert.equal(result.kind, "error");
      assert.match(result.message, /'\(empty\)'/);
    });
  });

  describe("failed gh run (code 1)", () => {
    it('treats "no pull requests" stderr as the absence of a PR', () => {
      assert.deepEqual(classifyPrState(1, "", "no pull requests found for branch feature/x"), {
        kind: "none",
      });
    });

    it('matches "no pull request" wording (singular)', () => {
      assert.deepEqual(classifyPrState(1, "", "No Pull Request branches found"), { kind: "none" });
    });

    it('does not treat unrelated code-1 failures as "none"', () => {
      const result = classifyPrState(1, "", "gh: To get started with GitHub CLI, please run: gh auth login");
      assert.equal(result.kind, "error");
      assert.match(result.message, /gh pr view failed \(exit 1\)/);
      assert.match(result.message, /gh auth login/);
    });
  });

  describe("other gh failures", () => {
    it("surfaces auth and network failures as errors, never as no-PR", () => {
      const result = classifyPrState(4, "", "connection refused");
      assert.equal(result.kind, "error");
      assert.match(result.message, /exit 4/);
      assert.match(result.message, /connection refused/);
    });

    it("falls back to stdout when stderr is empty", () => {
      const result = classifyPrState(2, "boom\n", "");
      assert.equal(result.kind, "error");
      assert.match(result.message, /boom/);
    });

    it('says "no output" when gh produced neither stdout nor stderr', () => {
      const result = classifyPrState(3, "", "");
      assert.equal(result.kind, "error");
      assert.match(result.message, /no output/);
    });
  });
});
