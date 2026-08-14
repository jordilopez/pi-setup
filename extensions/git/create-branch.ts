/**
 * Git Create Branch — `/git:create-branch` command
 *
 * Interactively creates a new branch: detects the repo's trunk branches
 * (master/main/develop) and its real default branch (via origin/HEAD), lets
 * the user pick the base, and converts the name to kebab-case. The actual
 * `git checkout -b` step is delegated to the shared `createBranch()` helper
 * in `common.ts`.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createBranch, TRUNK_BRANCHES } from "./common";

/**
 * Converts any string to kebab-case.
 * Handles camelCase, PascalCase, spaces, underscores, and hyphens.
 */
function toKebabCase(input: string): string {
  return input
    .trim()
    // Insert hyphen between lower→upper transitions (camelCase)
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    // Insert hyphen between letter/number sequences (separated by non-alphanumeric)
    .replace(/[\s_]+/g, "-")
    // Lowercase everything
    .toLowerCase()
    // Remove any character that isn't alphanumeric or hyphen
    .replace(/[^a-z0-9-]/g, "")
    // Collapse multiple hyphens
    .replace(/-+/g, "-")
    // Strip leading/trailing hyphens
    .replace(/^-+|-+$/g, "");
}

/**
 * Returns the trunk branches that exist locally in this repo.
 */
async function getExistingTrunkBranches(pi: ExtensionAPI): Promise<string[]> {
  const found: string[] = [];
  for (const candidate of TRUNK_BRANCHES) {
    const { code } = await pi.exec("git", [
      "show-ref",
      "--verify",
      "--quiet",
      `refs/heads/${candidate}`,
    ]);
    if (code === 0) found.push(candidate);
  }
  return found;
}

/**
 * Detects the repo's default branch from origin/HEAD (e.g. `origin/main` →
 * `main`). Returns null when it can't be determined or isn't a trunk branch.
 */
async function detectDefaultBranch(pi: ExtensionAPI): Promise<string | null> {
  const { stdout } = await pi.exec("git", [
    "symbolic-ref",
    "--short",
    "refs/remotes/origin/HEAD",
  ]);
  const ref = stdout?.trim();
  if (!ref) return null;
  const name = ref.replace(/^origin\//, "");
  return TRUNK_BRANCHES.includes(name) ? name : null;
}

export function registerCreateBranch(pi: ExtensionAPI): void {
  pi.registerCommand("git:create-branch", {
    description: "Interactively create a new git branch",
    handler: async (_args, ctx) => {
      // Step 1: Detect trunk branches and pick the base
      const trunks = await getExistingTrunkBranches(pi);
      const defaultBranch =
        (await detectDefaultBranch(pi)) ?? trunks[0] ?? null;

      const source = await ctx.ui.select("Start from which branch?", [
        ...trunks.map((t) => (t === defaultBranch ? `${t} (default)` : t)),
        "current branch",
      ]);

      if (!source) {
        ctx.ui.notify("Cancelled", "info");
        return;
      }

      const fromCurrent = source === "current branch";
      const baseRef = fromCurrent ? "HEAD" : source.replace(" (default)", "");

      // Step 2: Enter branch name
      const rawName = await ctx.ui.input(
        "Enter branch name (will be converted to kebab-case):",
      );

      if (!rawName || !rawName.trim()) {
        ctx.ui.notify("Cancelled — no name provided", "info");
        return;
      }

      const branchName = toKebabCase(rawName);

      if (!branchName) {
        ctx.ui.notify("Invalid branch name after conversion", "error");
        return;
      }

      // Step 3: Confirm before creating
      const confirmed = await ctx.ui.confirm(
        "Create branch",
        `Create branch "${branchName}" from ${fromCurrent ? "the current branch" : baseRef}?`,
      );

      if (!confirmed) {
        ctx.ui.notify("Cancelled", "info");
        return;
      }

      // Step 4: Create the branch via the shared helper (validates the name,
      // refuses trunk branches, and surfaces git failures as clear errors)
      try {
        createBranch({
          branchName,
          baseRef,
          cwd: process.cwd(),
        });
        ctx.ui.notify(
          `Branch "${branchName}" created successfully from ${fromCurrent ? "the current branch" : baseRef}`,
          "success",
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`Failed to create branch: ${msg}`, "error");
      }
    },
  });
}
