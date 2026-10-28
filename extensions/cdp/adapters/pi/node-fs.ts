/**
 * Production adapter: `PathFs` over `node:fs` synchronous introspection.
 */

import { lstatSync, realpathSync } from "node:fs";

import type { PathFs } from "../../ports/fs.ts";

export const NodePathFs: PathFs = {
  realpath: (path) => realpathSync(path),
  lstat: (path) => lstatSync(path),
};
