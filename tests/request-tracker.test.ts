/**
 * Tests for `RequestTracker`: id allocation, resolve/reject, timeout, and
 * bump-invalidation on disconnect.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { RequestTracker } from "../extensions/cdp/domain/request-tracker.ts";

describe("RequestTracker", () => {
  it("resolves a request by id", async () => {
    const tracker = new RequestTracker();
    const { id, promise } = tracker.allocate("Page.navigate", 1000);
    tracker.resolve(id, { frameId: "abc" });
    assert.deepEqual(await promise, { frameId: "abc" });
    assert.equal(tracker.pendingCount, 0);
  });

  it("rejects with a CDP error prefixed by the method name", async () => {
    const tracker = new RequestTracker();
    const { id, promise } = tracker.allocate("Runtime.evaluate", 1000);
    tracker.rejectWithCdpError(id, "oops");
    await assert.rejects(promise, /Runtime\.evaluate: oops/);
  });

  it("rejects with a timeout when no response arrives", async () => {
    const tracker = new RequestTracker();
    const { promise } = tracker.allocate("Page.reload", 5);
    await assert.rejects(promise, /CDP timeout: Page\.reload/);
    assert.equal(tracker.pendingCount, 0);
  });

  it("bump rejects every in-flight request with connection-closed", async () => {
    const tracker = new RequestTracker();
    const a = tracker.allocate("A", 10_000);
    const b = tracker.allocate("B", 10_000);

    tracker.bump();

    await assert.rejects(a.promise, /CDP connection closed/);
    await assert.rejects(b.promise, /CDP connection closed/);
    assert.equal(tracker.pendingCount, 0);
  });

  it("ignores resolve/reject for an already-evicted (stale) id", async () => {
    const tracker = new RequestTracker();
    const { id, promise } = tracker.allocate("A", 10_000);

    // bump() rejects the in-flight request; consume that rejection.
    const rejected = assert.rejects(promise, /CDP connection closed/);
    tracker.bump();

    assert.doesNotThrow(() => tracker.resolve(id, "result"));
    assert.doesNotThrow(() => tracker.rejectWithCdpError(id, "late"));
    assert.equal(tracker.pendingCount, 0);

    await rejected;
  });
});
