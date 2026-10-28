/**
 * Screenshot write-path safety policy.
 *
 * Restricts writes to inside the project directory and refuses to follow any
 * symlink that could redirect a write outside it. `node:path` (pure string
 * operations) is used directly; the two filesystem operations are injected via
 * the `PathFs` port so the policy is unit-testable without a real filesystem.
 */

import { dirname, resolve, sep } from "node:path";

import type { PathFs } from "../ports/fs.ts";

export type ScreenshotPathErrorCode =
  "path outside project" | "parent directory missing" | "parent resolves outside project" | "path is a symlink";

export class ScreenshotPathError extends Error {
  readonly code: ScreenshotPathErrorCode;

  constructor(code: ScreenshotPathErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "ScreenshotPathError";
  }
}

/**
 * Validate that writing to `requestedPath` (relative to `cwd`) stays inside the
 * project. Returns the resolved absolute path; throws {@link ScreenshotPathError}
 * on the first violated guard. The adapter then opens with `O_NOFOLLOW` so a
 * symlink racing in after this check still cannot redirect the write.
 */
export function validateScreenshotPath(requestedPath: string, cwd: string, pathFs: PathFs): string {
  const requested = resolve(cwd, requestedPath);

  if (requested !== cwd && !requested.startsWith(cwd + sep)) {
    throw new ScreenshotPathError("path outside project", `Screenshot path must be inside the project: ${requested}`);
  }

  const parentDir = dirname(requested);
  let realParent: string;
  try {
    realParent = pathFs.realpath(parentDir);
  } catch {
    throw new ScreenshotPathError(
      "parent directory missing",
      `Screenshot parent directory does not exist: ${parentDir}`,
    );
  }
  if (realParent !== cwd && !realParent.startsWith(cwd + sep)) {
    throw new ScreenshotPathError(
      "parent resolves outside project",
      `Screenshot parent directory resolves outside the project: ${realParent}`,
    );
  }

  try {
    if (pathFs.lstat(requested).isSymbolicLink()) {
      throw new ScreenshotPathError(
        "path is a symlink",
        `Screenshot path is a symlink — refusing to follow: ${requested}`,
      );
    }
  } catch (error) {
    if (error instanceof ScreenshotPathError) throw error;
    // lstat throws only when nothing exists at the target — fine, the
    // O_NOFOLLOW open in the adapter will create it.
  }

  return requested;
}
