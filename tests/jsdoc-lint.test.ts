/**
 * Tests for the jsdoc-lint style-guide checker.
 *
 * Run with: node --experimental-strip-types --test tests/jsdoc-lint.test.ts
 */

import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { execFileSync } from "node:child_process";

import { lintSource } from "../scripts/jsdoc-lint.ts";

const REPO_ROOT = new URL("..", import.meta.url).pathname;

describe("lintSource", () => {
  it("flags @returns void", () => {
    const source = `/** Does a thing.\n * @returns void\n */\nexport function f(): void {}\n`;
    const diags = lintSource(source, "src/f.ts");
    assert.ok(diags.some((d) => d.rule === "returns-void"));
    assert.ok(
      diags.some((d) => d.rule === "redundant-returns"),
      "annotated return type makes @returns redundant",
    );
  });

  it("flags @param in .ts files (types live on the signature)", () => {
    const source = `/** Does a thing.\n * @param a - the input\n */\nexport function f(a: string): number { return 1; }\n`;
    const diags = lintSource(source, "src/f.ts");
    assert.ok(diags.some((d) => d.rule === "param-in-ts"));
  });

  it("flags @description tags in .ts files", () => {
    const source = `/** @description Does a thing. */\nexport function f(): number { return 1; }\n`;
    const diags = lintSource(source, "src/f.ts");
    assert.ok(diags.some((d) => d.rule === "description-in-ts"));
  });

  it("allows @returns when the return type is NOT annotated", () => {
    const source = `/** Does a thing.\n * @returns the computed value\n */\nexport function f() { return 1; }\n`;
    const diags = lintSource(source, "src/f.ts");
    assert.ok(!diags.some((d) => d.rule === "redundant-returns"));
  });

  it("reports line numbers matching the source", () => {
    const source = `export function ok() {\n  return 1;\n}\n/** Bad.\n * @returns void\n */\nexport function bad(): void {}\n`;
    const diags = lintSource(source, "src/bad.ts");
    const voidDiag = diags.find((d) => d.rule === "returns-void");
    assert.ok(voidDiag);
    assert.equal(voidDiag.line, 5);
  });

  it("reports zero diagnostics for a clean file", () => {
    const source = readFileSync(`${REPO_ROOT}extensions/git/common.ts`, "utf8");
    assert.deepEqual(lintSource(source, "extensions/git/common.ts"), []);
  });

  it("exits non-zero when the CLI runs against a file with anti-patterns", () => {
    let status = 0;
    try {
      execFileSync(
        "node",
        [
          "--experimental-strip-types",
          `${REPO_ROOT}scripts/jsdoc-lint.ts`,
          `${REPO_ROOT}tests/fixtures/jsdoc/anti-patterns.ts`,
        ],
        {
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch (err) {
      status = err.status ?? 1;
    }
    assert.notEqual(status, 0, "CLI should exit non-zero when diagnostics exist");
  });
});
