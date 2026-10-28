/**
 * Tests for `isRegexSafe`, the conservative ReDoS guard.
 *
 * Pins the accept/reject cases the policy documents: nested repetition and
 * adjacent unbounded quantifiers are rejected; optional and small bounded
 * repeats are accepted.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { isRegexSafe } from "../extensions/redact/domain/pattern-safety.ts";

describe("isRegexSafe", () => {
  it("accepts literals, anchors, optional units, and bounded repeats", () => {
    assert.equal(isRegexSafe("abc"), true);
    assert.equal(isRegexSafe("^abc$"), true);
    assert.equal(isRegexSafe("a?b?"), true);
    assert.equal(isRegexSafe("\\d{2,3}[\\s-]?\\d{3}"), true);
  });

  it("rejects nested repetition (catastrophic backtracking)", () => {
    for (const pattern of ["(a+)+", "(a*)*", "(a?)*", "(a|aa)+", "([a-z]+)+", "((a)+)+"]) {
      assert.equal(isRegexSafe(pattern), false, pattern);
    }
  });

  it("rejects adjacent unbounded quantifiers", () => {
    for (const pattern of ["\\w*\\w*", "a?a*", ".*.*"]) {
      assert.equal(isRegexSafe(pattern), false, pattern);
    }
  });
});
