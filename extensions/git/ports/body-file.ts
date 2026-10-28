/**
 * Outbound port: temporary file storage for a PR body.
 *
 * The domain must hand `gh` a body via a `--body-file` path, but choosing
 * where that file lives and how it is secured/removed is infrastructure, not
 * domain. This port keeps `node:fs` out of `domain/` while letting tests use
 * an in-memory implementation.
 */

/** A written body file plus the disposal that removes its temp directory. */
export interface BodyFileHandle {
  /** Path to pass to `--body-file`. */
  path: string;
  /** Remove the file and its private directory. Always called in `finally`. */
  dispose(): Promise<void>;
}

export interface BodyFileStore {
  /** Write `body` to a private file with restrictive permissions. */
  write(body: string): Promise<BodyFileHandle>;
}
