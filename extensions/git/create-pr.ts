/**
 * Git Create PR — `/git:create-pr` command
 *
 * Pushes the current branch (--force-with-lease) and creates or updates its
 * pull request against the repo's base branch (master, falling back to main).
 * Refuses to run on trunk branches.
 *
 * Takes an optional argument: a path to a summary file used as the PR body
 * (the concise description), as used by the git-create-pr skill.
 * Without a summary, new PRs get a concise "## What changed" list of commit
 * subjects — commit bodies stay in the commits, not the PR description.
 *
 * The PR title is the branch name.
 *
 * The PR mechanics (open PR → edit, else → create) live in `createPr()` so
 * the logic is testable and reusable without a pi instance.
 */

import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { TRUNK_BRANCHES, resolveBaseBranch } from "./common.ts";

/**
 * Single-quote a string for safe embedding in a shell command.
 */
function shq(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/**
 * Runs a `gh` command and returns its stdout. Throws on failure.
 */
function gh(args: string[]): string {
  return execSync(`gh ${args.join(" ")}`, { stdio: "pipe" }).toString();
}

export interface CreatePrOptions {
  branchName: string;
  /** Base branch the PR targets (resolved by the caller). */
  base: string;
  /**
   * Path to a file whose contents become the PR body (concise summary). On
   * create and on update it replaces the previous body.
   * When omitted: new PRs get a concise "## What changed" commit-subject
   * list; updates keep the existing body.
   */
  summaryFile?: string;
}

export interface CreatePrResult {
  action: "created" | "updated";
  prUrl: string;
}

/**
 * Creates or updates the PR for `branchName` against `base`:
 * - an existing OPEN PR is updated (title + body)
 * - no PR, or the existing PR is MERGED/CLOSED → a new PR is created
 *   (a closed/merged PR must never be edited — its description belongs to
 *   the shipped work)
 *
 * The body is the provided summary when available, else a concise
 * "## What changed" commit-subject list (new PRs) or the existing body
 * (updates). The title is the branch name.
 */
export function createPr(options: CreatePrOptions): CreatePrResult {
  const { branchName, base, summaryFile } = options;

  // Find an existing OPEN PR (MERGED/CLOSED ones must not be edited)
  let prNumber: string | null = null;
  try {
    const info = JSON.parse(gh(["pr", "view", shq(branchName), "--json", "number,state"])) as {
      number: number;
      state: string;
    };
    if (info.state !== "MERGED" && info.state !== "CLOSED") {
      prNumber = String(info.number);
    }
  } catch {
    // No PR found — will create a new one
  }

  // Range of commits that belong to this branch. Prefer the local base ref:
  // it is robust when the base exists locally but not on `origin`, or the
  // remote is named differently. Fall back to `origin/<base>` for checkouts
  // where the local base ref is absent (shallow clones, worktrees).
  let mergeBase: string;
  try {
    mergeBase = execSync(`git merge-base HEAD ${shq(base)}`, {
      stdio: "pipe",
    })
      .toString()
      .trim();
  } catch {
    mergeBase = execSync(`git merge-base HEAD origin/${shq(base)}`, {
      stdio: "pipe",
    })
      .toString()
      .trim();
  }
  const range = `${mergeBase}..HEAD`;

  // Body intro:
  // - summaryFile (skill flow): concise summary, used verbatim on both create
  //   and update (replaces any previous body)
  // - new PR without summary: concise "## What changed" list of commit
  //   subjects — commit bodies stay in the commits, not the PR description
  // - update without summary: keep the existing body so hand-written edits
  //   are never clobbered
  let bodyIntro: string;
  if (summaryFile && existsSync(summaryFile)) {
    bodyIntro = readFileSync(summaryFile, "utf-8").trim();
  } else if (prNumber) {
    try {
      const body = JSON.parse(gh(["pr", "view", shq(branchName), "--json", "body"])) as { body: string | null };
      bodyIntro = (body.body ?? "").trimEnd();
    } catch {
      bodyIntro = "";
    }
  } else {
    const subjects = execSync(`git log --format=%s ${range}`, { stdio: "pipe" })
      .toString()
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((s) => `- ${s}`);
    bodyIntro = subjects.length ? `## What changed\n\n${subjects.join("\n")}` : "";
  }

  const title = branchName;

  // gh --body-file avoids shell-quoting issues with multi-line bodies;
  // the file lives in a private mkdtemp dir so concurrent runs can't collide
  const tmpDir = mkdtempSync(join(tmpdir(), "git-create-pr-"));
  const bodyFile = join(tmpDir, "pr-body.md");
  writeFileSync(bodyFile, bodyIntro);

  try {
    if (prNumber) {
      gh(["pr", "edit", shq(branchName), "--title", shq(title), "--body-file", shq(bodyFile)]);
      const url = JSON.parse(gh(["pr", "view", shq(branchName), "--json", "url"])) as { url: string };
      return { action: "updated", prUrl: url.url };
    }

    const out = gh([
      "pr",
      "create",
      "--base",
      shq(base),
      "--head",
      shq(branchName),
      "--title",
      shq(title),
      "--body-file",
      shq(bodyFile),
    ]);
    return { action: "created", prUrl: out.trim() };
  } finally {
    unlinkSync(bodyFile);
    rmdirSync(tmpDir);
  }
}

export function registerCreatePr(pi: ExtensionAPI): void {
  pi.registerCommand("git:create-pr", {
    description:
      "Push the current branch and create or update its PR against the base branch (master/main). Title is the branch name. Optional arg: path to a summary file (used as the PR body)",
    handler: async (args, ctx) => {
      // Optional argument: path to a summary file used as the PR body (the
      // last argument wins, so legacy two-argument calls still resolve).
      const summaryFile = args.trim().split(/\s+/).filter(Boolean).pop();

      // Step 1: Identify the current branch and resolve the base
      const { stdout: currentOut } = await pi.exec("git", ["branch", "--show-current"]);
      const currentBranch = currentOut?.trim();
      if (!currentBranch) {
        ctx.ui.notify("Not on a branch (detached HEAD?) — aborting", "error");
        return;
      }

      if (TRUNK_BRANCHES.includes(currentBranch)) {
        ctx.ui.notify(`Refusing to create a PR from trunk branch "${currentBranch}"`, "error");
        return;
      }

      const base = resolveBaseBranch();
      if (!base) {
        ctx.ui.notify("No `master` or `main` branch found — aborting", "error");
        return;
      }

      // Step 2: Warn about uncommitted changes (push only includes commits)
      const { stdout: statusOut } = await pi.exec("git", ["status", "--porcelain"]);
      if (statusOut?.trim()) {
        const proceed = await ctx.ui.confirm(
          "Uncommitted changes",
          "There are uncommitted changes — they will NOT be included in the push. Continue?",
        );
        if (!proceed) {
          ctx.ui.notify("Cancelled", "info");
          return;
        }
      }

      // Step 3: Push the branch
      // A branch created by /git:create-branch has no upstream yet, and a
      // plain `push` fails with "no upstream". Detect the remote and any
      // existing upstream: first push uses --set-upstream <remote> HEAD;
      // subsequent pushes reuse the configured upstream.
      const { stdout: remoteOut } = await pi.exec("git", ["remote"]);
      const remote =
        (remoteOut ?? "")
          .split(/\s+/)
          .map((s) => s.trim())
          .find(Boolean) || "origin";
      const upstream = await pi.exec("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
      const hasUpstream = upstream.code === 0 && !!upstream.stdout?.trim();
      const pushArgs = hasUpstream
        ? ["push", "--force-with-lease"]
        : ["push", "--set-upstream", remote, "HEAD", "--force-with-lease"];
      ctx.ui.notify(`Pushing ${currentBranch}...`, "info");
      const push = await pi.exec("git", pushArgs, {
        timeout: 120_000,
      });
      if (push.code !== 0) {
        ctx.ui.notify(`Push failed:\n${push.stderr?.trim() || push.stdout?.trim()}`, "error");
        return;
      }

      // Step 4: Create or update the PR
      ctx.ui.notify("Creating/updating PR...", "info");
      try {
        const result = createPr({
          branchName: currentBranch,
          base,
          summaryFile,
        });
        ctx.ui.notify(
          `✅ PR ${result.action}${result.prUrl ? `: ${result.prUrl}` : ""} (${currentBranch} → ${base})`,
          "info",
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        ctx.ui.notify(`PR creation failed:\n${msg}`, "error");
      }
    },
  });
}
