/**
 * Tests for `validateWritePath`, the shared write-path safety policy, and its
 * screenshot wrapper.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ScreenshotPathError,
  validateScreenshotPath,
  validateWritePath,
  WritePathError,
} from "../domain/path-guard.ts";
import type { PathFs } from "../ports/fs.ts";

const CWD = "/repo";

function fakePathFs(impl: Partial<PathFs> = {}): PathFs {
  return {
    realpath: impl.realpath ?? ((path) => path),
    lstat: impl.lstat ?? (() => ({ isSymbolicLink: () => false })),
  };
}

function codeOf(error: unknown): string {
  return error instanceof WritePathError ? error.code : "";
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

  it("keeps messages screenshot-shaped", () => {
    assert.throws(
      () => validateScreenshotPath("../outside.png", CWD, fakePathFs()),
      (e: unknown) => /^Screenshot path must be inside the project/u.test((e as Error).message),
    );
  });
});

describe("validateWritePath", () => {
  it("uses the subject in every message", () => {
    assert.throws(
      () => validateWritePath("../outside.json", CWD, fakePathFs(), "Report"),
      (e: unknown) => /^Report path must be inside the project/u.test((e as Error).message),
    );
    const noParent = fakePathFs({
      realpath: () => {
        throw new Error("ENOENT");
      },
    });
    assert.throws(
      () => validateWritePath("missing/a.json", CWD, noParent, "Report"),
      (e: unknown) => /^Report parent directory does not exist/u.test((e as Error).message),
    );
    const escaping = fakePathFs({
      realpath: (path) => (path === "/repo/out" ? "/outside/out" : path),
    });
    assert.throws(
      () => validateWritePath("out/a.json", CWD, escaping, "Report"),
      (e: unknown) => /^Report parent directory resolves outside the project/u.test((e as Error).message),
    );
    const symlink = fakePathFs({ lstat: () => ({ isSymbolicLink: () => true }) });
    assert.throws(
      () => validateWritePath("out/a.json", CWD, symlink, "Report"),
      (e: unknown) => /^Report path is a symlink/u.test((e as Error).message),
    );
  });

  it("accepts a nested report path inside the project", () => {
    assert.equal(
      validateWritePath(".lighthouse/a.report.json", CWD, fakePathFs(), "Report"),
      "/repo/.lighthouse/a.report.json",
    );
  });

  it("defaults the subject to Write", () => {
    assert.throws(
      () => validateWritePath("../outside", CWD, fakePathFs()),
      (e: unknown) => /^Write path must be inside the project/u.test((e as Error).message),
    );
  });

  it("exports the deprecated screenshot error alias", () => {
    assert.equal(ScreenshotPathError, WritePathError);
  });
});
