/**
 * Git Extension
 *
 * Wires up `/git:create-branch` (interactive branch creation), the
 * `git_create_pr` tool (confirmed push + PR create/update), and the
 * `git_prune_merged_branches` tool (confirmed deletion of local branches
 * already merged into the remote default branch).
 *
 * Only `index.ts` is auto-loaded by pi from this directory (see extension
 * loader discovery rules); command and tool files are imported here.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerCreateBranch } from "./adapters/pi/create-branch.ts";
import { registerCreatePr } from "./adapters/pi/create-pr.ts";
import { registerPruneMergedBranches } from "./prune-merged.ts";

export default function gitExtension(pi: ExtensionAPI) {
  registerCreateBranch(pi);
  registerCreatePr(pi);
  registerPruneMergedBranches(pi);
}
