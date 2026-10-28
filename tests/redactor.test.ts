/**
 * Tests for `compilePatterns` and `redact`.
 *
 * `compilePatterns` pins the per-entry validation (type, size, ReDoS safety,
 * regex syntax, MAX_PATTERNS cap); `redact` pins the no-patterns → undefined
 * contract and text-vs-image handling.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { compilePatterns } from "../extensions/redact/domain/patterns.ts";
import { redact } from "../extensions/redact/domain/redactor.ts";

describe("compilePatterns", () => {
  it("compiles valid [label, regex, replacement] triples", () => {
    const patterns = compilePatterns([["dni", "\\b\\d{8}[A-Z]\\b", "[REDACTED]"]]);
    assert.equal(patterns.length, 1);
    assert.equal(patterns[0].label, "dni");
    assert.equal(patterns[0].replacement, "[REDACTED]");
  });

  it("skips malformed, oversized, unsafe, and invalid entries individually", () => {
    const patterns = compilePatterns([
      ["too short"], // length < 3
      [1, "x", "y"], // wrong label type
      ["ok", "secret", "X"], // valid — the only survivor
      ["oversize", "a".repeat(201), "X"], // > MAX_PATTERN_CHARS
      ["unsafe", "(a+)+", "X"], // ReDoS-unsafe
      ["invalid", "(", "X"], // syntactically invalid regex
    ]);
    assert.deepEqual(
      patterns.map((p) => p.label),
      ["ok"],
    );
  });

  it("caps the pattern count at MAX_PATTERNS", () => {
    const entries = Array.from({ length: 150 }, (_, i) => [`p${i}`, `x${i}`, "R"]);
    assert.equal(compilePatterns(entries).length, 100);
  });
});

describe("redact", () => {
  it("returns undefined when there are no patterns", () => {
    assert.equal(redact([{ type: "text", text: "hi" }], []), undefined);
  });

  it("redacts matching text and leaves non-text blocks untouched", () => {
    const patterns = compilePatterns([["secret", "secret", "[REDACTED]"]]);
    const image = { type: "image" as const, data: "img", mimeType: "image/png" };

    const output = redact([{ type: "text", text: "the secret token" }, image], patterns);

    assert.ok(output);
    assert.equal(output[0].type, "text");
    if (output[0].type === "text") assert.equal(output[0].text, "the [REDACTED] token");
    assert.strictEqual(output[1], image);
  });
});
