/**
 * Tests for `createPatternLoader`, the mtime-invalidation cache + policy.
 *
 * The properties under test: a missing config resets the cache silently;
 * unchanged mtime reuses the compiled array; a changed mtime recompiles; a
 * broken/unreadable config keeps the last-known-good set (or returns `[]` when
 * never valid) and warns exactly once per mtime.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createPatternLoader } from "../domain/loader.ts";
import type { WarnSink } from "../ports/warn-sink.ts";
import { FakeConfigSource } from "./support/fake-config-source.ts";

const LABEL = "/cfg/redact.json";

function okConfig(
  mtimeMs: number,
  patterns: unknown[] = [["secret", "secret", "X"]],
): { status: "ok"; mtimeMs: number; text: string } {
  return { status: "ok", mtimeMs, text: JSON.stringify({ patterns }) };
}

function capture(): { warns: string[]; sink: WarnSink } {
  const warns: string[] = [];
  return { warns, sink: { warn: (message) => warns.push(message) } };
}

describe("createPatternLoader", () => {
  it("returns [] and resets the cache when the config is missing", () => {
    const source = new FakeConfigSource().setNext({ status: "missing" });
    const { warns, sink } = capture();
    const load = createPatternLoader(source, sink, LABEL);

    // First load caches nothing; a later missing read stays silent.
    source.setNext(okConfig(1));
    assert.equal(load().length, 1);
    source.setNext({ status: "missing" });
    assert.deepEqual(load(), []);
    assert.equal(warns.length, 0);
  });

  it("reuses the compiled array when the mtime is unchanged", () => {
    const source = new FakeConfigSource().setNext(okConfig(1));
    const { sink } = capture();
    const load = createPatternLoader(source, sink, LABEL);

    const first = load();
    const second = load();

    assert.strictEqual(first, second);
    assert.equal(source.reads.length, 2); // still reads each call, but no recompile
  });

  it("recompiles when the mtime changes", () => {
    const source = new FakeConfigSource();
    const { sink } = capture();
    const load = createPatternLoader(source, sink, LABEL);

    source.setNext(okConfig(1, [["a", "a", "X"]]));
    assert.equal(load()[0].label, "a");

    source.setNext(okConfig(2, [["b", "b", "Y"]]));
    assert.equal(load()[0].label, "b");
  });

  it("keeps last-known-good patterns and warns once per broken mtime", () => {
    const source = new FakeConfigSource();
    const { warns, sink } = capture();
    const load = createPatternLoader(source, sink, LABEL);

    source.setNext(okConfig(1));
    const good = load();

    // Broken config at a new mtime → keep cache, warn once.
    source.setNext({ status: "ok", mtimeMs: 2, text: "{ not valid json" });
    assert.strictEqual(load(), good);
    assert.equal(warns.length, 1);

    // Same broken mtime again → no additional warning.
    load();
    assert.equal(warns.length, 1);
  });

  it("warns once and returns [] when the config was never valid", () => {
    const source = new FakeConfigSource().setNext({ status: "unreadable", mtimeMs: 5 });
    const { warns, sink } = capture();
    const load = createPatternLoader(source, sink, LABEL);

    assert.deepEqual(load(), []);
    assert.equal(warns.length, 1);

    load();
    assert.equal(warns.length, 1, "warn once per mtime");
  });

  it("keeps the cache when a readable file turns unreadable", () => {
    const source = new FakeConfigSource();
    const { warns, sink } = capture();
    const load = createPatternLoader(source, sink, LABEL);

    source.setNext(okConfig(1));
    const good = load();

    source.setNext({ status: "unreadable", mtimeMs: 2 });
    assert.strictEqual(load(), good);
    assert.equal(warns.length, 1);
  });
});
