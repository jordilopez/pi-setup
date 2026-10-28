/**
 * Adapter tests: `FileConfigSource` maps the filesystem onto the `ConfigSource`
 * contract (existing file → `ok`, absent → `missing`, directory → `unreadable`).
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { FileConfigSource } from "../extensions/redact/adapters/pi/config-source.ts";

describe("FileConfigSource", () => {
  it("reads an existing file with its contents and mtime", () => {
    const dir = mkdtempSync(join(tmpdir(), "redact-test-"));
    const file = join(dir, "redact.json");
    writeFileSync(file, '{"patterns":[]}');
    try {
      const read = FileConfigSource(file).read();
      assert.equal(read.status, "ok");
      if (read.status === "ok") {
        assert.equal(read.text, '{"patterns":[]}');
        assert.ok(read.mtimeMs > 0);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports missing for an absent path", () => {
    assert.deepEqual(FileConfigSource(join(tmpdir(), "does-not-exist-redact.json")).read(), { status: "missing" });
  });

  it("reports unreadable for a directory (stat succeeds, read fails)", () => {
    const dir = mkdtempSync(join(tmpdir(), "redact-dir-test-"));
    try {
      const read = FileConfigSource(dir).read();
      assert.equal(read.status, "unreadable");
      if (read.status === "unreadable") assert.ok(read.mtimeMs > 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
