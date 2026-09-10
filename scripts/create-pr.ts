/**
 * Standalone GitHub pull-request runner.
 *
 * The Pi git extension uses the exported `createPr()` helper, while
 * `scripts/create-pr.sh` runs this file directly for skills and shell users.
 * No Pi APIs are imported so the PR flow works outside an active Pi session.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

import { TRUNK_BRANCHES, assertSafeBranchName, buildPushArgs, resolveBaseBranch } from "../extensions/git/common.ts";

function commandOutput(command: string, args: string[], cwd: string): string {
  return execFileSync(command, args, { cwd, stdio: "pipe" }).toString();
}

function gitOutput(args: string[], cwd: string): string {
  return commandOutput("git", args, cwd).trim();
}

function ghOutput(args: string[], cwd: string): string {
  return commandOutput("gh", args, cwd);
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
  const summaryFile = rawSummaryFile
    ? isAbsolute(rawSummaryFile)
      ? rawSummaryFile
      : join(cwd, rawSummaryFile)
    : undefined;

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

function hasUpstream(cwd: string): boolean {
  try {
    gitOutput(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], cwd);
    return true;
  } catch {
    return false;
  }
}

function pushBranch(branchName: string, cwd: string): void {
  const remote = gitOutput(["remote"], cwd).split(/\s+/).find(Boolean) ?? "origin";
  const args = buildPushArgs(hasUpstream(cwd), remote);
  execFileSync("git", args, { cwd, stdio: "inherit", timeout: 120_000 });
  console.log(`Pushed ${branchName}`);
}

function askToContinue(): Promise<boolean> {
  if (!process.stdin.isTTY) {
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    process.stdout.write("There are uncommitted changes — they will NOT be included in the push. Continue? [y/N] ");
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (answer) => {
      resolve(/^y(es)?$/i.test(answer.toString().trim()));
    });
  });
}

interface CliOptions {
  summaryFile?: string;
  assumeYes: boolean;
}

function parseArgs(args: string[]): CliOptions {
  let assumeYes = false;
  let summaryFile: string | undefined;

  for (const arg of args) {
    if (arg === "--yes") {
      assumeYes = true;
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else if (summaryFile) {
      throw new Error("Only one summary file may be provided");
    } else {
      summaryFile = arg;
    }
  }

  return { summaryFile, assumeYes };
}

/** Runs the complete standalone branch push and PR flow. */
export async function runCli(args: string[] = process.argv.slice(2), cwd = process.cwd()): Promise<void> {
  const { summaryFile, assumeYes } = parseArgs(args);
  const branchName = gitOutput(["branch", "--show-current"], cwd);

  if (!branchName) throw new Error("Not on a branch (detached HEAD?) — aborting");
  if (TRUNK_BRANCHES.includes(branchName)) {
    throw new Error(`Refusing to create a PR from trunk branch "${branchName}"`);
  }
  assertSafeBranchName(branchName);

  const base = resolveBaseBranch(cwd);
  if (!base) throw new Error("No `master` or `main` branch found — aborting");

  const dirty = gitOutput(["status", "--porcelain"], cwd).length > 0;
  if (dirty && !assumeYes && !(await askToContinue())) {
    throw new Error("Cancelled");
  }

  pushBranch(branchName, cwd);
  const result = createPr({ branchName, base, summaryFile, cwd });
  console.log(`PR ${result.action}: ${result.prUrl} (${branchName} → ${base})`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
