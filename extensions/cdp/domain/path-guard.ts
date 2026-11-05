/**
 * Write-path safety policy, shared by every tool that writes a file into the
 * project (screenshots, Lighthouse reports).
 *
 * Restricts writes to inside the project directory and refuses to follow any
 * symlink that could redirect a write outside it. `node:path` (pure string
 * operations) is used directly; the two filesystem operations are injected via
 * the `PathFs` port so the policy is unit-testable without a real filesystem.
 */

import { dirname, resolve, sep } from "node:path";

import type { PathFs } from "../ports/fs.ts";

export type WritePathErrorCode =
  "path outside project" | "parent directory missing" | "parent resolves outside project" | "path is a symlink";

export class WritePathError extends Error {
  readonly code: WritePathErrorCode;

  constructor(code: WritePathErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "WritePathError";
  }
}

/**
 * @deprecated Historical alias for {@link WritePathError}. Kept so existing
 * screenshot call sites and tests keep compiling; new code should use
 * `WritePathError`.
 */
export const ScreenshotPathError = WritePathError;
/** @deprecated Type-side alias for {@link WritePathError}. */
export type ScreenshotPathError = WritePathError;

/**
 * Validate that writing to `requestedPath` (relative to `cwd`) stays inside the
 * project. Returns the resolved absolute path; throws {@link WritePathError} on
 * the first violated guard. The adapter then opens with `O_NOFOLLOW` so a
 * symlink racing in after this check still cannot redirect the write.
 *
 * `subject` only shapes the error messages ("Screenshot path …", "Report path …").
 */
export function validateWritePath(requestedPath: string, cwd: string, pathFs: PathFs, subject = "Write"): string {
  const requested = resolve(cwd, requestedPath);

  if (requested !== cwd && !requested.startsWith(cwd + sep)) {
    throw new WritePathError("path outside project", `${subject} path must be inside the project: ${requested}`);
  }

  const parentDir = dirname(requested);
  let realParent: string;
  try {
    realParent = pathFs.realpath(parentDir);
  } catch {
    throw new WritePathError("parent directory missing", `${subject} parent directory does not exist: ${parentDir}`);
  }
  if (realParent !== cwd && !realParent.startsWith(cwd + sep)) {
    throw new WritePathError(
      "parent resolves outside project",
      `${subject} parent directory resolves outside the project: ${realParent}`,
    );
  }

  try {
    if (pathFs.lstat(requested).isSymbolicLink()) {
      throw new WritePathError("path is a symlink", `${subject} path is a symlink — refusing to follow: ${requested}`);
    }
  } catch (error) {
    if (error instanceof WritePathError) throw error;
    // lstat throws only when nothing exists at the target — fine, the
    // O_NOFOLLOW open in the adapter will create it.
  }

  return requested;
}

/** Screenshot-flavoured wrapper: same policy, screenshot-shaped messages. */
export function validateScreenshotPath(requestedPath: string, cwd: string, pathFs: PathFs): string {
  return validateWritePath(requestedPath, cwd, pathFs, "Screenshot");
}
