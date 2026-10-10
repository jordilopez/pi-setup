/**
 * Git Extension
 *
 * Wires up `/git:create-branch` (interactive branch creation) and the
 * `git_create_pr` tool (confirmed push + PR create/update).
 *
 * Only `index.ts` is auto-loaded by pi from this directory (see extension
 * loader discovery rules); command and tool files are imported here.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerCreateBranch } from "./create-branch.ts";
import { registerCreatePr } from "./create-pr.ts";

export default function gitExtension(pi: ExtensionAPI) {
  registerCreateBranch(pi);
  registerCreatePr(pi);
}
