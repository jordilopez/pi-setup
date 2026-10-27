/**
 * Tests for `runPrunePlan`, the confirmed branch-pruning flow.
 *
 * The properties under test: dry-run never confirms or deletes; cancelling the
 * gate performs no deletion; a partial deletion failure is reported honestly;
 * an unreachable `gh` degrades to ancestor-only evidence (with a warning);
 * branches checked out in another worktree are skipped; and a missing base ref
 * aborts before any discovery.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runPrunePlan } from "../extensions/git/domain/prune-merged.ts";
import { FakeExecutor } from "./__support__/git/fake-executor.ts";
import { FakeUi } from "./__support__/git/fake-ui.ts";

const CWD = "/repo";

function ok(stdout = "") {
  return { stdout, stderr: "", code: 0, killed: false };
}

const BASE_REF = "refs/remotes/origin/main";

interface RepoOpts {
  /** Local branch heads. `main` doubles as the trunk. */
  branches?: string[];
  /** Branch currently checked out. */
  current?: string;
  /** Branches checked out in other worktrees. */
  worktrees?: string[];
  /** Branches whose tip is an ancestor of origin/main. */
  merged?: string[];
  /** PR index lines (`branch url`). */
  mergedPrs?: string[];
  /** Force `gh pr list` to fail. */
  ghFails?: boolean;
  /** `git branch -D` outcome per branch; default success. */
  deleteFails?: string[];
  /** Whether origin/main exists. */
  hasBase?: boolean;
}

function makeExecutor(opts: RepoOpts = {}): FakeExecutor {
  const {
    branches = ["main", "feature/a", "feature/b", "feature/c"],
    current = "main",
    worktrees = [],
    merged = ["feature/a"],
    mergedPrs = [],
    ghFails = false,
    deleteFails = [],
    hasBase = true,
  } = opts;

  const executor = new FakeExecutor();
  executor.setHandler((command, args) => {
    if (command === "git" && args[0] === "symbolic-ref") {
      // origin/HEAD resolution first, then current branch lookup.
      if (args[1] === "--short" && args[2] === "refs/remotes/origin/HEAD") {
        return ok("origin/main\n");
      }
      return ok(`${current}\n`);
    }
    if (command === "git" && args[0] === "show-ref") {
      const ref = args[3];
      const isRemoteBase = ref === BASE_REF;
      const isLocalTrunk = ref === "refs/heads/main" || ref === "refs/heads/master";
      return (isRemoteBase && hasBase) || isLocalTrunk ? ok() : { stdout: "", stderr: "", code: 128, killed: false };
    }
    if (command === "git" && args[0] === "for-each-ref") return ok(branches.map((b) => `${b}\n`).join(""));
    if (command === "git" && args[0] === "worktree") {
      return ok(worktrees.map((b) => `worktree /wt/${b}\nHEAD abc\nbranch refs/heads/${b}\n\n`).join(""));
    }
    if (command === "gh" && args[0] === "pr" && args[1] === "list") {
      return ghFails
        ? { stdout: "", stderr: "gh: not authenticated", code: 1, killed: false }
        : ok(mergedPrs.map((line) => `${line}\n`).join(""));
    }
    if (command === "git" && args[0] === "merge-base") {
      const branch = args[2];
      return merged.includes(branch) ? ok() : { stdout: "", stderr: "", code: 1, killed: false };
    }
    if (command === "git" && args[0] === "branch" && args[1] === "-D") {
      const branch = args[2];
      return deleteFails.includes(branch)
        ? { stdout: "", stderr: "error: cannot delete branch", code: 1, killed: false }
        : ok(`Deleted branch ${branch}\n`);
    }
    throw new Error(`unexpected ${command} ${args.join(" ")}`);
  });
  return executor;
}

describe("runPrunePlan", () => {
  it("dry run lists prunable branches without confirming or deleting", async () => {
    const executor = makeExecutor();
    const ui = new FakeUi();

    const outcome = await runPrunePlan(executor, ui, { cwd: CWD, dryRun: true });

    assert.equal(outcome.kind, "done");
    if (outcome.kind !== "done") return;
    assert.deepEqual(
      outcome.result.prunable.map((p) => p.branch),
      ["feature/a"],
    );
    assert.deepEqual(outcome.result.deleted, []);
    assert.equal(outcome.result.dryRun, true);
    assert.equal(ui.calls.filter((c) => c.kind === "confirm").length, 0, "no confirmation in dry run");
    assert.ok(!executor.calls.some((c) => c.args[0] === "branch" && c.args[1] === "-D"), "no deletion in dry run");
  });

  it("cancelling the gate deletes nothing", async () => {
    const executor = makeExecutor();
    const ui = new FakeUi();
    ui.confirmResult = false;

    const outcome = await runPrunePlan(executor, ui, { cwd: CWD, dryRun: false });

    assert.deepEqual(outcome, { kind: "cancelled" });
    assert.ok(!executor.calls.some((c) => c.args[0] === "branch" && c.args[1] === "-D"), "no deletion on cancel");
  });

  it("deletes confirmed branches and records evidence", async () => {
    const executor = makeExecutor();
    const ui = new FakeUi();
    ui.confirmResult = true;

    const outcome = await runPrunePlan(executor, ui, { cwd: CWD, dryRun: false });

    assert.equal(outcome.kind, "done");
    if (outcome.kind !== "done") return;
    assert.deepEqual(outcome.result.deleted, [{ branch: "feature/a", evidence: "ancestor" }]);
    assert.deepEqual(outcome.result.failed, []);
  });

  it("reports partial deletion failure rather than a clean result", async () => {
    const executor = makeExecutor({ deleteFails: ["feature/a"] });
    const ui = new FakeUi();
    ui.confirmResult = true;

    const outcome = await runPrunePlan(executor, ui, { cwd: CWD, dryRun: false });

    assert.equal(outcome.kind, "done");
    if (outcome.kind !== "done") return;
    assert.deepEqual(outcome.result.deleted, []);
    assert.equal(outcome.result.failed.length, 1);
    assert.equal(outcome.result.failed[0].branch, "feature/a");
  });

  it("degrades to ancestor-only evidence when gh is unreachable", async () => {
    const executor = makeExecutor({ ghFails: true });
    const ui = new FakeUi();
    ui.confirmResult = true;

    const outcome = await runPrunePlan(executor, ui, { cwd: CWD, dryRun: false });

    assert.equal(outcome.kind, "done");
    if (outcome.kind !== "done") return;
    assert.equal(outcome.result.warning !== undefined, true);
    assert.deepEqual(
      outcome.result.prunable.map((p) => p.branch),
      ["feature/a"],
    );
  });

  it("counts a merged PR (squash merge) as prunable evidence", async () => {
    const executor = makeExecutor({ merged: [], mergedPrs: ["feature/b https://example.test/pr/2"] });
    const ui = new FakeUi();
    ui.confirmResult = true;

    const outcome = await runPrunePlan(executor, ui, { cwd: CWD, dryRun: false });

    assert.equal(outcome.kind, "done");
    if (outcome.kind !== "done") return;
    assert.deepEqual(outcome.result.prunable, [
      { branch: "feature/b", evidence: { kind: "pr", url: "https://example.test/pr/2" } },
    ]);
    assert.deepEqual(outcome.result.deleted, [
      { branch: "feature/b", evidence: "pr", url: "https://example.test/pr/2" },
    ]);
  });

  it("skips the current branch, trunk, and worktree-checked-out branches", async () => {
    const executor = makeExecutor({ worktrees: ["feature/c"], merged: ["feature/a", "feature/b", "feature/c"] });
    const ui = new FakeUi();
    ui.confirmResult = true;

    const outcome = await runPrunePlan(executor, ui, { cwd: CWD, dryRun: false });

    assert.equal(outcome.kind, "done");
    if (outcome.kind !== "done") return;
    const skipped = outcome.result.skipped.map((s) => s.branch);
    assert.ok(skipped.includes("main"), "trunk/current skipped");
    assert.ok(skipped.includes("feature/c"), "worktree branch skipped");
    assert.deepEqual(
      outcome.result.prunable.map((p) => p.branch),
      ["feature/a", "feature/b"],
    );
  });

  it("aborts when origin/<default> is missing", async () => {
    const executor = makeExecutor({ hasBase: false });
    const ui = new FakeUi();

    await assert.rejects(runPrunePlan(executor, ui, { cwd: CWD, dryRun: true }), /run 'git fetch origin' first/);
  });
});
