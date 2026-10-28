/**
 * Tests for `runCreatePrPlan`, the confirmed PR create/update flow.
 *
 * The properties under test: read-only validation happens before the
 * confirmation gate; cancelling the gate performs no push and no `gh`
 * mutation; a successful run pushes (when requested), writes and disposes the
 * body file, and reports created vs updated; and a skipped push leaves the
 * branch untouched.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runCreatePrPlan } from "../domain/create-pr.ts";
import { FakeBodyFileStore } from "./support/fake-body-file.ts";
import { FakeExecutor } from "./support/fake-executor.ts";
import { FakeUi } from "./support/fake-ui.ts";

const CWD = "/repo";

function ok(stdout = "") {
  return { stdout, stderr: "", code: 0, killed: false };
}

/**
 * Fake git/gh that behaves like a repo on `branch` with the given PR state.
 * `prState` is what `gh pr view --json state` reports ("" means "no PR").
 */
function makeExecutor(opts: { branch?: string; prState?: string; remote?: string } = {}): FakeExecutor {
  const { branch = "feature/x", prState = "", remote = "origin" } = opts;
  const executor = new FakeExecutor();
  executor.setHandler((command, args) => {
    if (command === "git" && args[0] === "branch" && args[1] === "--show-current") return ok(`${branch}\n`);
    if (command === "git" && args[0] === "check-ref-format") return ok();
    if (command === "git" && args[0] === "show-ref") {
      const name = args[3].replace("refs/heads/", "");
      return name === "master" || name === "main" ? ok() : { stdout: "", stderr: "", code: 128, killed: false };
    }
    if (command === "git" && args[0] === "remote") return ok(`${remote}\n`);
    if (command === "git" && args[0] === "rev-parse") return { stdout: "", stderr: "", code: 128, killed: false }; // no upstream
    if (command === "git" && args[0] === "push") return ok();
    if (command === "gh" && args[0] === "pr" && args[1] === "view" && args.includes("state")) {
      return prState
        ? ok(`${prState}\n`)
        : { stdout: "", stderr: "no pull requests found for branch", code: 1, killed: false };
    }
    if (command === "gh" && args[0] === "pr" && args[1] === "view" && args.includes("url")) {
      return ok("https://example.test/pr/7\n");
    }
    if (command === "gh" && args[0] === "pr" && (args[1] === "create" || args[1] === "edit")) return ok();
    throw new Error(`unexpected ${command} ${args.join(" ")}`);
  });
  return executor;
}

describe("runCreatePrPlan", () => {
  it("creates a PR after confirmation: pushes, writes+disposes the body file", async () => {
    const executor = makeExecutor();
    const ui = new FakeUi();
    ui.confirmResult = true;
    const bodyFiles = new FakeBodyFileStore();

    const outcome = await runCreatePrPlan(executor, ui, bodyFiles, {
      title: "feat: add thing",
      body: "## Summary\nAdds a thing.",
      push: true,
      cwd: CWD,
    });

    assert.equal(outcome.kind, "done");
    if (outcome.kind !== "done") return;
    assert.deepEqual(outcome.result, {
      url: "https://example.test/pr/7",
      branch: "feature/x",
      base: "master",
      action: "created",
      pushed: true,
    });

    assert.ok(
      executor.calls.some((c) => c.args[0] === "push"),
      "pushed the branch",
    );
    assert.equal(bodyFiles.written.length, 1);
    assert.equal(bodyFiles.disposed.length, 1);

    const ghCreate = executor.calls.find((c) => c.args[0] === "pr" && c.args[1] === "create");
    assert.ok(ghCreate, "ran gh pr create");
    assert.ok(ghCreate.args.includes("--body-file"), "used the body file");
  });

  it("does not push when push is false", async () => {
    const executor = makeExecutor();
    const ui = new FakeUi();
    ui.confirmResult = true;

    const outcome = await runCreatePrPlan(executor, ui, new FakeBodyFileStore(), {
      title: "t",
      body: "b",
      push: false,
      cwd: CWD,
    });

    assert.equal(outcome.kind, "done");
    assert.ok(!executor.calls.some((c) => c.args[0] === "push"), "push skipped");
  });

  it("treats an open PR as an update", async () => {
    const executor = makeExecutor({ prState: "OPEN" });
    const ui = new FakeUi();
    ui.confirmResult = true;

    const outcome = await runCreatePrPlan(executor, ui, new FakeBodyFileStore(), {
      title: "t",
      body: "b",
      push: false,
      cwd: CWD,
    });

    assert.equal(outcome.kind, "done");
    if (outcome.kind !== "done") return;
    assert.equal(outcome.result.action, "updated");
    assert.ok(
      executor.calls.some((c) => c.args[0] === "pr" && c.args[1] === "edit"),
      "ran gh pr edit",
    );
  });

  it("cancels without pushing or mutating when the user declines", async () => {
    const executor = makeExecutor();
    const ui = new FakeUi();
    ui.confirmResult = false;
    const bodyFiles = new FakeBodyFileStore();

    const outcome = await runCreatePrPlan(executor, ui, bodyFiles, {
      title: "t",
      body: "b",
      push: true,
      cwd: CWD,
    });

    assert.deepEqual(outcome, { kind: "cancelled" });
    assert.ok(!executor.calls.some((c) => c.args[0] === "push"), "no push on cancel");
    assert.ok(!executor.calls.some((c) => c.args[0] === "pr" && c.args[1] !== "view"), "no gh mutation on cancel");
    assert.equal(bodyFiles.written.length, 0);
  });

  it("disposes the body file even when gh fails", async () => {
    const ui = new FakeUi();
    ui.confirmResult = true;
    const bodyFiles = new FakeBodyFileStore();

    // A fresh executor that fails only on `gh pr create`.
    const e = makeExecutor();
    e.setHandler((command, args) => {
      if (command === "gh" && args[0] === "pr" && args[1] === "create") {
        return { stdout: "", stderr: "gh exploded", code: 1, killed: false };
      }
      if (command === "git" && args[0] === "branch" && args[1] === "--show-current") return ok("feature/x\n");
      if (command === "git" && args[0] === "check-ref-format") return ok();
      if (command === "git" && args[0] === "show-ref") {
        const name = args[3].replace("refs/heads/", "");
        return name === "master" || name === "main" ? ok() : { stdout: "", stderr: "", code: 128, killed: false };
      }
      if (command === "git" && args[0] === "remote") return ok("origin\n");
      if (command === "gh" && args[0] === "pr" && args[1] === "view" && args.includes("state")) {
        return { stdout: "", stderr: "no pull requests found for branch", code: 1, killed: false };
      }
      throw new Error(`unexpected ${command} ${args.join(" ")}`);
    });

    await assert.rejects(
      runCreatePrPlan(e, ui, bodyFiles, { title: "t", body: "b", push: false, cwd: CWD }),
      /gh pr create failed: gh exploded/,
    );
    assert.equal(bodyFiles.written.length, 1);
    assert.equal(bodyFiles.disposed.length, 1, "body file disposed in finally");
  });

  it("rejects an empty title or body before touching git", async () => {
    const executor = new FakeExecutor();
    const ui = new FakeUi();

    await assert.rejects(
      runCreatePrPlan(executor, ui, new FakeBodyFileStore(), { title: "  ", body: "b", push: true, cwd: CWD }),
      /non-empty PR title/,
    );
    await assert.rejects(
      runCreatePrPlan(executor, ui, new FakeBodyFileStore(), { title: "t", body: " ", push: true, cwd: CWD }),
      /non-empty PR body/,
    );
    assert.equal(executor.calls.length, 0);
  });

  it("refuses a trunk branch before confirming", async () => {
    const executor = makeExecutor({ branch: "main" });
    const ui = new FakeUi();
    ui.confirmResult = true;

    await assert.rejects(
      runCreatePrPlan(executor, ui, new FakeBodyFileStore(), { title: "t", body: "b", push: true, cwd: CWD }),
      /trunk branch 'main'/,
    );
    assert.equal(ui.calls.filter((c) => c.kind === "confirm").length, 0, "no confirmation shown");
  });
});
