/**
 * Outbound port: minimal filesystem introspection for path safety.
 *
 * The screenshot path guard must `realpath` a parent directory and `lstat` the
 * final component; exposing just those two keeps `node:fs` out of `domain/`.
 */

export interface PathFs {
  /** Resolve symlinks and return the canonical absolute path. */
  realpath(path: string): string;
  /** Stat a path without following symlinks. Throws when it does not exist. */
  lstat(path: string): { isSymbolicLink(): boolean };
}
