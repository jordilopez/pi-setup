/**
 * Tests for the pure candidate-selection logic of the jsdoc_doc_candidates
 * tool.
 *
 * Run with: node --experimental-strip-types --test tests/jsdoc-candidates.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";

import { collectCandidates } from "../extensions/llm-tools/jsdoc-candidates.ts";

const REPO_ROOT = new URL("..", import.meta.url).pathname;

describe("collectCandidates", () => {
  it("returns exported functions and classes as candidates", () => {
    const source = `
export function documented(a: string) {
  if (!a) return "";
  return \`value: \${a}\`;
}
export class Widget {
  render() {
    return "";
  }
}
const hidden = 1;
export { hidden };
`;
    const result = collectCandidates(source, "src/widget.ts", false);
    const names = result.candidates.map((c) => c.name);
    assert.deepEqual(names.sort(), ["Widget", "documented"]);
  });

  it("skips simple get/set accessors and one-line exports", () => {
    const source = `
class C {
  get foo() { return this._foo; }
  set foo(v: number) { this._foo = v; }
}
export function one() { return 1; }
`;
    const result = collectCandidates(source, "src/c.ts", false);
    const names = result.candidates.map((c) => c.name);
    assert.ok(!names.includes("foo"));
    assert.equal(names.length, 0, "the only export is a one-line function");
  });

  it("skips test files unless includeTests is true", () => {
    const source = `export function helper() {\n  return 1;\n}\n`;
    assert.equal(collectCandidates(source, "src/helper.test.ts", false).candidates.length, 0);
    assert.equal(collectCandidates(source, "src/helper.spec.ts", false).candidates.length, 0);
    assert.equal(collectCandidates(source, "src/helper.test.ts", true).candidates.length, 1);
  });

  it("skips names starting with underscore and declared-boolean exports", () => {
    const source = `
export function _internal() { return 1; }
export const enabled: boolean = true;
export function real() {
  return 1;
}
`;
    const result = collectCandidates(source, "src/flags.ts", false);
    const names = result.candidates.map((c) => c.name);
    assert.deepEqual(names, ["real"]);
  });

  it("keeps all exported constants except underscored and booleans", () => {
    const source = `export const TRUNK = ["master", "main", "develop"];\nexport const FLAG = { a: 1 };\nexport const _hidden = 1;\nexport const enabled: boolean = true;\n`;
    const result = collectCandidates(source, "src/constants.ts", false);
    const names = result.candidates.map((c) => c.name);
    assert.deepEqual(names.sort(), ["FLAG", "TRUNK"]);
  });

  it("finds the real candidates in extensions/git/common.ts", () => {
    const source = readFileSync(`${REPO_ROOT}extensions/git/common.ts`, "utf8");
    const result = collectCandidates(source, "extensions/git/common.ts", false);
    const names = result.candidates.map((c) => c.name);
    assert.ok(names.includes("createBranch"), "createBranch is a candidate");
    assert.ok(names.includes("assertSafeBranchName"), "assertSafeBranchName is a candidate");
    assert.ok(names.includes("TRUNK_BRANCHES"), "TRUNK_BRANCHES (multi-line array) is a candidate");
  });

  it("rejects non-TS extensions", () => {
    const result = collectCandidates("x", "src/thing.py", false);
    assert.deepEqual(result.candidates, []);
    assert.match(result.skipped[0].reason, /not a \.ts\/\.tsx file/);
  });
});
