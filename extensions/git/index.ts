/**
 * Git Extension
 *
 * Entry point that wires up the git commands (one file per command):
 * - `create-branch.ts` — `/git:create-branch`: interactive branch creation
 * - `end-branch.ts` — `/git:end-branch`: merge current branch into base and delete it
 * - `create-pr.ts` — `/git:create-pr`: push and create/update a PR for the current branch
 *
 * Only `index.ts` is auto-loaded by pi from this directory (see extension
 * loader discovery rules); command files are imported here.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerCreateBranch } from "./create-branch";
import { registerCreatePr } from "./create-pr";
import { registerEndBranch } from "./end-branch";

export default function gitExtension(pi: ExtensionAPI) {
  registerCreateBranch(pi);
  registerEndBranch(pi);
  registerCreatePr(pi);
}
