/**
 * Git Extension
 *
 * Wires up `/git:create-branch`: interactive branch creation.
 *
 * Only `index.ts` is auto-loaded by pi from this directory (see extension
 * loader discovery rules); command files are imported here.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerCreateBranch } from "./create-branch.ts";

export default function gitExtension(pi: ExtensionAPI) {
  registerCreateBranch(pi);
}
