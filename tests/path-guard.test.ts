/**
 * Tests for `validateScreenshotPath`, the screenshot write-path safety policy.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ScreenshotPathError, validateScreenshotPath } from "../extensions/cdp/domain/path-guard.ts";
import type { PathFs } from "../extensions/cdp/ports/fs.ts";

const CWD = "/repo";

function fakePathFs(impl: Partial<PathFs> = {}): PathFs {
  return {
    realpath: impl.realpath ?? ((path) => path),
    lstat: impl.lstat ?? (() => ({ isSymbolicLink: () => false })),
  };
}

function codeOf(error: unknown): string {
  return error instanceof ScreenshotPathError ? error.code : "";
}

describe("validateScreenshotPath", () => {
  it("returns the resolved path for a safe write", () => {
    assert.equal(validateScreenshotPath("shots/a.png", CWD, fakePathFs()), "/repo/shots/a.png");
  });

  it("rejects a path escaping the project lexically", () => {
    assert.throws(
      () => validateScreenshotPath("../outside.png", CWD, fakePathFs()),
      (e: unknown) => codeOf(e) === "path outside project",
    );
  });

  it("rejects when the parent directory does not exist", () => {
    const pathFs = fakePathFs({
      realpath: () => {
        throw new Error("ENOENT");
      },
    });
    assert.throws(
      () => validateScreenshotPath("missing/a.png", CWD, pathFs),
      (e: unknown) => codeOf(e) === "parent directory missing",
    );
  });

  it("rejects when the parent resolves outside the project", () => {
    const pathFs = fakePathFs({
      realpath: (path) => (path === "/repo/shots" ? "/outside/shots" : path),
    });
    assert.throws(
      () => validateScreenshotPath("shots/a.png", CWD, pathFs),
      (e: unknown) => codeOf(e) === "parent resolves outside project",
    );
  });

  it("rejects a symlink at the final component", () => {
    const pathFs = fakePathFs({ lstat: () => ({ isSymbolicLink: () => true }) });
    assert.throws(
      () => validateScreenshotPath("shots/a.png", CWD, pathFs),
      (e: unknown) => codeOf(e) === "path is a symlink",
    );
  });

  it("tolerates a missing final component (lstat ENOENT)", () => {
    const pathFs = fakePathFs({
      lstat: () => {
        throw new Error("ENOENT");
      },
    });
    assert.equal(validateScreenshotPath("shots/new.png", CWD, pathFs), "/repo/shots/new.png");
  });
});
