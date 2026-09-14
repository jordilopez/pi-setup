/**
 * Git Create PR — `/git:create-pr` command
 *
 * The command remains the interactive Pi wrapper: it confirms dirty checkouts,
 * pushes with Pi's process runner, and reports progress in the UI. The
 * reusable PR mechanics live in this module so they are also callable by
 * pi-setup's standalone CLI runner.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep } from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { TRUNK_BRANCHES, buildPushArgs, resolveBaseBranch } from "./common.ts";

function commandOutput(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, stdio: "pipe" }).toString();
}

function gitOutput(args: string[], cwd: string): string {
  return commandOutput("git", args, cwd).trim();
}

function ghOutput(args: string[], cwd: string): string {
  return commandOutput("gh", args, cwd);
}

/**
 * Resolves existing path components through symlinks while preserving the
 * lexical suffix for a path that does not exist yet.
 */
function canonicalPath(path: string): string {
  const absolutePath = resolve(path);
  if (existsSync(absolutePath)) return realpathSync(absolutePath);

  const missing: string[] = [];
  let current = absolutePath;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return absolutePath;
    missing.unshift(basename(current));
    current = parent;
  }
  return resolve(realpathSync(current), ...missing);
}

function isWithin(candidate: string, root: string): boolean {
  return candidate === root || candidate.startsWith(root + sep);
}

/** Filename used by Pi workflows for a temporary PR summary. */
const PR_DESCRIPTION_FILENAME = "pr-description.md";
/** Optional controlled directory for temporary PR summaries. */
const CONTROLLED_SUMMARY_DIRNAME = "pi-pr-summaries";

/**
 * Approved temporary summary locations. Only exact paths are allowed, so an
 * unrelated file cannot be reached through a broader prefix:
 * - `<tmpdir>/pr-description.md`
 * - `<tmpdir>/pi-pr-summaries/pr-description.md`, provided that controlled
 *   directory exists with no group or other permissions.
 */
function isAllowedTemporarySummary(candidate: string): boolean {
  const temporaryRoot = canonicalPath(tmpdir());
  if (candidate === canonicalPath(join(temporaryRoot, PR_DESCRIPTION_FILENAME))) return true;

  const controlledDirectory = canonicalPath(join(temporaryRoot, CONTROLLED_SUMMARY_DIRNAME));
  if (candidate !== canonicalPath(join(controlledDirectory, PR_DESCRIPTION_FILENAME))) return false;
  try {
    return (statSync(controlledDirectory).mode & 0o077) === 0;
  } catch {
    return false;
  }
}

/**
 * Validates and canonicalizes a caller-supplied summary path, returning the
 * exact path that must be used for existence checks and reads. Rejects paths
 * outside the repository and the approved temporary summary locations, and
 * resolves symlinks so a link into another location cannot be read.
 */
function resolveSummaryPath(summaryPath: string, cwd: string): string {
  const candidate = canonicalPath(isAbsolute(summaryPath) ? summaryPath : join(cwd, summaryPath));
  const repositoryRoot = canonicalPath(cwd);
  if (isWithin(candidate, repositoryRoot)) return candidate;
  if (isAllowedTemporarySummary(candidate)) return candidate;

  throw new Error(
    `Summary file must be inside the repository or an approved temporary summary location: ${summaryPath}`,
  );
}

export interface CreatePrOptions {
  branchName: string;
  /** Base branch the PR targets (resolved by the caller). */
  base: string;
  /** Path to a file whose contents become the PR body. */
  summaryFile?: string;
  /** Repository directory in which git and gh should run. */
  cwd?: string;
}

export interface CreatePrResult {
  action: "created" | "updated";
  prUrl: string;
}

/**
 * Creates or updates the open PR for a branch.
 *
 * A merged or closed PR is never edited; a new PR is created instead. When no
 * summary is supplied, new PRs get a concise commit-subject list and existing
 * PRs retain their current body.
 */
export function createPr(options: CreatePrOptions): CreatePrResult {
  const { branchName, base, summaryFile: rawSummaryFile, cwd = process.cwd() } = options;
  // Canonicalize and validate once; the returned path is the only one used
  // for existence checks and reads below, so a symlink swapped in after this
  // point cannot redirect the read to an unrelated file.
  const summaryFile = rawSummaryFile ? resolveSummaryPath(rawSummaryFile, cwd) : undefined;

  let prNumber: string | null = null;
  try {
    const info = JSON.parse(ghOutput(["pr", "view", branchName, "--json", "number,state"], cwd)) as {
      number: number;
      state: string;
    };
    if (info.state !== "MERGED" && info.state !== "CLOSED") {
      prNumber = String(info.number);
    }
  } catch (error) {
    // Distinguish "no PR" from actual gh failures so callers are not misled.
    const details = error as {
      message?: string;
      stderr?: Buffer | string;
      status?: number;
    };
    const stderr = typeof details.stderr === "string" ? details.stderr : (details.stderr?.toString() ?? "");
    const output = `${details.message ?? ""}\n${stderr}`;
    const isNotFound = details.status === 1 && /not found|no pull requests/i.test(output);
    if (!isNotFound) {
      throw error;
    }
    // No PR for this branch — create a new one.
  }

  let mergeBase: string;
  try {
    mergeBase = gitOutput(["merge-base", "HEAD", base], cwd);
  } catch {
    mergeBase = gitOutput(["merge-base", "HEAD", `origin/${base}`], cwd);
  }
  const range = `${mergeBase}..HEAD`;

  let bodyIntro: string;
  if (summaryFile && existsSync(summaryFile)) {
    bodyIntro = readFileSync(summaryFile, "utf-8").trim();
  } else if (prNumber) {
    try {
      const body = JSON.parse(ghOutput(["pr", "view", branchName, "--json", "body"], cwd)) as {
        body: string | null;
      };
      bodyIntro = (body.body ?? "").trimEnd();
    } catch {
      bodyIntro = "";
    }
  } else {
    const subjects = gitOutput(["log", "--format=%s", range], cwd)
      .split("\n")
      .filter(Boolean)
      .map((subject) => `- ${subject}`);
    bodyIntro = subjects.length ? `## What changed\n\n${subjects.join("\n")}` : "";
  }

  let tmpDir: string | undefined;
  try {
    tmpDir = mkdtempSync(join(tmpdir(), "git-create-pr-"));
    const bodyFile = join(tmpDir, "pr-body.md");
    writeFileSync(bodyFile, bodyIntro);

    if (prNumber) {
      ghOutput(["pr", "edit", branchName, "--title", branchName, "--body-file", bodyFile], cwd);
      const url = JSON.parse(ghOutput(["pr", "view", branchName, "--json", "url"], cwd)) as { url: string };
      return { action: "updated", prUrl: url.url };
    }

    const output = ghOutput(
      ["pr", "create", "--base", base, "--head", branchName, "--title", branchName, "--body-file", bodyFile],
      cwd,
    );
    return { action: "created", prUrl: output.trim() };
  } finally {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
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
      const pushArgs = buildPushArgs(hasUpstream, remote);
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
          cwd: process.cwd(),
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
