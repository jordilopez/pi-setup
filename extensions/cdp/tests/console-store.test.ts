/**
 * Tests for the bounded console store and console-event formatting.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { formatConsoleApiCall } from "../domain/console-format.ts";
import { createConsoleStore } from "../domain/console-store.ts";

describe("formatConsoleApiCall", () => {
  it("joins argument values with spaces and preserves type", () => {
    const entry = formatConsoleApiCall({
      type: "log",
      args: [{ value: "hello" }, { value: "world" }],
    });
    assert.deepEqual(entry, { type: "log", message: "hello world" });
  });

  it("truncates long messages to MAX_CONSOLE_MSG_CHARS", () => {
    const entry = formatConsoleApiCall({ type: "error", args: [{ value: "x".repeat(5000) }] });
    assert.equal(entry.message.length, 2000);
  });
});

describe("createConsoleStore", () => {
  it("stamps entries with the injected clock and drains a copy", () => {
    const store = createConsoleStore(10, () => 1234);
    store.push({ type: "log", message: "a" });

    const drained = store.drain();
    assert.deepEqual(drained, [{ type: "log", message: "a", timestamp: 1234 }]);
    assert.equal(store.size, 1, "drain does not clear");
  });

  it("evicts the oldest entries beyond the bound", () => {
    const store = createConsoleStore(3, () => 0);
    store.push({ type: "log", message: "1" });
    store.push({ type: "log", message: "2" });
    store.push({ type: "log", message: "3" });
    store.push({ type: "log", message: "4" });

    assert.deepEqual(
      store.drain().map((e) => e.message),
      ["2", "3", "4"],
    );
  });

  it("clear() empties the store", () => {
    const store = createConsoleStore(3);
    store.push({ type: "log", message: "1" });
    store.clear();
    assert.equal(store.size, 0);
  });
});
