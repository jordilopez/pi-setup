/**
 * Unit + integration tests for the `/git:create-worktree` flow:
 * `getRepoRoot`, `defaultWorktreePath`, `resolveWorktreePath`,
 * `decideCreateWorktree` (validation → `git worktree add` plan), and
 * `runCreateWorktreePlan` (execution + failure interpretation), plus a
 * synthetic end-to-end drive through the registered command using `FakeUi` +
 * `FakeExecutor`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { registerCreateWorktree } from "../adapters/pi/create-worktree.ts";
import {
  decideCreateWorktree,
  defaultWorktreePath,
  getRepoRoot,
  resolveWorktreePath,
  runCreateWorktreePlan,
} from "../domain/create-worktree.ts";
import { FakeExecutor } from "./support/fake-executor.ts";
import { FakeUi } from "./support/fake-ui.ts";

const REPO = "/src/app";

describe("getRepoRoot", () => {
  it("returns the reported top level directory", async () => {
    const executor = new FakeExecutor();
    executor.setDefault({ stdout: `${REPO}\n`, stderr: "", code: 0, killed: false });

    assert.equal(await getRepoRoot(executor, "/src/app/sub/dir"), REPO);
    assert.deepEqual(executor.calls[0].args, ["rev-parse", "--show-toplevel"]);
  });

  it("falls back to cwd when git cannot resolve a root", async () => {
    const executor = new FakeExecutor();
    executor.setDefault({ stdout: "", stderr: "fatal: not a git repository", code: 128, killed: false });

    assert.equal(await getRepoRoot(executor, "/not/a/repo"), "/not/a/repo");
  });
});

describe("defaultWorktreePath", () => {
  it("places a branch-named sibling beside the repo", () => {
    assert.equal(defaultWorktreePath("/src/app", "feature/x"), "/src/app-feature-x");
  });
});

describe("resolveWorktreePath", () => {
  it("resolves relative input against the repo root", () => {
    assert.equal(resolveWorktreePath("../app-feature-x", REPO), "/src/app-feature-x");
    assert.equal(resolveWorktreePath("   ../app-feature-x  ", REPO), "/src/app-feature-x");
  });

  it("keeps absolute input as-is", () => {
    assert.equal(resolveWorktreePath("/worktrees/app-feature-x", REPO), "/worktrees/app-feature-x");
  });

  it("refuses empty input", () => {
    assert.throws(() => resolveWorktreePath("   ", REPO), /Worktree path is required/);
  });

  it("refuses the repo root itself", () => {
    assert.throws(() => resolveWorktreePath(".", REPO), /repository root itself/);
  });

  it("refuses paths inside .git", () => {
    assert.throws(() => resolveWorktreePath(".git/wt", REPO), /inside "\.git"/);
  });

  it("refuses .git case-insensitively (macOS/Windows filesystems)", () => {
    assert.throws(() => resolveWorktreePath(".GIT/wt", REPO), /inside "\.git"/);
    assert.throws(() => resolveWorktreePath("sub/.Git/wt", REPO), /inside "\.git"/);
  });

  it("refuses tilde paths rather than creating a literal '.' directory", () => {
    assert.throws(() => resolveWorktreePath("~/app-feature-x", REPO), /Tilde paths are not expanded/);
  });
});

describe("decideCreateWorktree", () => {
  it("returns a worktree-add plan for a valid request", () => {
    assert.deepEqual(
      decideCreateWorktree({ branchName: "feature/x", baseRef: "main", path: "/src/app-feature-x", cwd: REPO }),
      {
        command: "git",
        args: ["worktree", "add", "-b", "feature/x", "--", "/src/app-feature-x", "main"],
        cwd: REPO,
        branchName: "feature/x",
        baseRef: "main",
        path: "/src/app-feature-x",
      },
    );
  });

  it("refuses a missing branch name", () => {
    assert.throws(
      () => decideCreateWorktree({ branchName: "", baseRef: "main", path: "/wt", cwd: REPO }),
      /Branch name is required/,
    );
  });

  it("refuses trunk branch names", () => {
    for (const trunk of ["master", "main", "develop"]) {
      assert.throws(
        () => decideCreateWorktree({ branchName: trunk, baseRef: "main", path: "/wt", cwd: REPO }),
        new RegExp(`Refusing to create worktree branch "${trunk}"`),
      );
    }
  });

  it("refuses unsafe branch names", () => {
    assert.throws(
      () => decideCreateWorktree({ branchName: "bad name", baseRef: "main", path: "/wt", cwd: REPO }),
      /Unsafe branch name/,
    );
  });

  it("refuses a missing base ref", () => {
    assert.throws(
      () => decideCreateWorktree({ branchName: "feature/x", baseRef: "", path: "/wt", cwd: REPO }),
      /No base ref provided/,
    );
  });

  it("refuses a missing or relative path", () => {
    assert.throws(
      () => decideCreateWorktree({ branchName: "feature/x", baseRef: "main", path: "", cwd: REPO }),
      /Worktree path is required/,
    );
    assert.throws(
      () => decideCreateWorktree({ branchName: "feature/x", baseRef: "main", path: "../wt", cwd: REPO }),
      /Worktree path must be absolute/,
    );
  });
});

describe("runCreateWorktreePlan", () => {
  const plan = () =>
    decideCreateWorktree({ branchName: "feature/x", baseRef: "main", path: "/src/app-feature-x", cwd: REPO });

  it("runs worktree add and returns the created worktree identity", async () => {
    const executor = new FakeExecutor();

    const result = await runCreateWorktreePlan(executor, plan());

    assert.deepEqual(result, { branchName: "feature/x", baseRef: "main", path: "/src/app-feature-x" });
    assert.deepEqual(executor.calls[0].args, [
      "worktree",
      "add",
      "-b",
      "feature/x",
      "--",
      "/src/app-feature-x",
      "main",
    ]);
  });

  it("explains an existing branch", async () => {
    const executor = new FakeExecutor();
    executor.setDefault({
      stdout: "",
      stderr: "fatal: a branch named 'feature/x' already exists",
      code: 128,
      killed: false,
    });

    await assert.rejects(runCreateWorktreePlan(executor, plan()), /Branch "feature\/x" already exists in \/src\/app/);
  });

  it("explains an existing path", async () => {
    const executor = new FakeExecutor();
    executor.setDefault({
      stdout: "",
      stderr: "fatal: '/src/app-feature-x' already exists",
      code: 128,
      killed: false,
    });

    await assert.rejects(
      runCreateWorktreePlan(executor, plan()),
      /Worktree path "\/src\/app-feature-x" already exists/,
    );
  });

  it("explains a branch checked out in another worktree", async () => {
    const executor = new FakeExecutor();
    executor.setDefault({
      stdout: "",
      stderr: "fatal: 'feature/x' is already checked out at '/src/app-other'",
      code: 128,
      killed: false,
    });

    await assert.rejects(
      runCreateWorktreePlan(executor, plan()),
      /Branch "feature\/x" is already checked out in another worktree/,
    );
  });

  it("explains a non-repository cwd", async () => {
    const executor = new FakeExecutor();
    executor.setDefault({ stdout: "", stderr: "fatal: not a git repository", code: 128, killed: false });

    await assert.rejects(runCreateWorktreePlan(executor, plan()), /is not a git repository/);
  });

  it("falls back to a descriptive error for other failures", async () => {
    const executor = new FakeExecutor();
    executor.setDefault({ stdout: "", stderr: "fatal: something else", code: 128, killed: false });

    await assert.rejects(
      runCreateWorktreePlan(executor, plan()),
      /Failed to create worktree "\/src\/app-feature-x" for branch "feature\/x" from "main": fatal: something else/,
    );
  });
});

describe("registerCreateWorktree (synthetic end-to-end)", () => {
  interface HarnessOptions {
    /** `null` models a dismissed base-branch selector (`undefined` from the ui port). */
    selectResult?: string | null;
    inputResults?: (string | undefined)[];
    confirmResult?: boolean;
    worktreeError?: string;
  }

  function harness(options: HarnessOptions = {}) {
    const executor = new FakeExecutor();
    executor.setHandler((command, args) => {
      if (command === "git" && args[0] === "rev-parse") {
        return { stdout: `${REPO}\n`, stderr: "", code: 0, killed: false };
      }
      if (command === "git" && args[0] === "show-ref" && args[1] === "--verify") {
        const name = args[3].replace("refs/heads/", "");
        return name === "master" || name === "main"
          ? { stdout: "", stderr: "", code: 0, killed: false }
          : { stdout: "", stderr: "", code: 128, killed: false };
      }
      if (command === "git" && args[0] === "symbolic-ref") {
        return { stdout: "refs/remotes/origin/main\n", stderr: "", code: 0, killed: false };
      }
      if (command === "git" && args[0] === "worktree" && args[1] === "add") {
        return options.worktreeError
          ? { stdout: "", stderr: options.worktreeError, code: 128, killed: false }
          : { stdout: "", stderr: "", code: 0, killed: false };
      }
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    });

    const ui = new FakeUi();
    ui.selectResult = options.selectResult === null ? undefined : (options.selectResult ?? "master");
    ui.confirmResult = options.confirmResult ?? true;

    const inputResults = [...(options.inputResults ?? [])];
    let inputIndex = 0;
    ui.input = (title, placeholder) => {
      ui.calls.push({ kind: "input", title, placeholder });
      return Promise.resolve(inputResults[inputIndex++]);
    };

    let handler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
    const pi = {
      registerCommand: (_name: string, def: { handler: typeof handler }) => {
        handler = def.handler;
      },
      exec: (command: string, args: string[], opts?: unknown) => executor.run(command, args, opts as never),
    };

    registerCreateWorktree(pi as unknown as ExtensionAPI);

    const ctx = { ui, cwd: "/src/app/packages/api", signal: undefined } as unknown as ExtensionCommandContext;

    return { executor, ui, run: () => (handler as NonNullable<typeof handler>)("", ctx) };
  }

  it("uses the suggested sibling path when the path input is empty", async () => {
    const { executor, ui, run } = harness({ inputResults: ["My Feature Branch", "  "] });

    await run();

    const add = executor.calls.find((c) => c.args[0] === "worktree");
    assert.ok(add, "worktree add ran");
    assert.deepEqual(add.args, [
      "worktree",
      "add",
      "-b",
      "my-feature-branch",
      "--",
      "/src/app-my-feature-branch",
      "master",
    ]);
    assert.equal(add.options.cwd, REPO, "runs from the repo root, not the subdirectory");

    assert.ok(
      ui.calls.some(
        (c) =>
          c.kind === "notify" &&
          c.message ===
            'Worktree created at /src/app-my-feature-branch on branch "my-feature-branch" from master — ' +
              'cd "/src/app-my-feature-branch" to start working',
      ),
      "notified success",
    );
  });

  it("creates the worktree at an explicit absolute path", async () => {
    const { executor, run } = harness({ inputResults: ["fix bug 42", "/worktrees/fix-bug-42"] });

    await run();

    const add = executor.calls.find((c) => c.args[0] === "worktree");
    assert.ok(add);
    assert.deepEqual(add.args, ["worktree", "add", "-b", "fix-bug-42", "--", "/worktrees/fix-bug-42", "master"]);
  });

  it("cancels when the path prompt is dismissed", async () => {
    const { executor, ui, run } = harness({ inputResults: ["my-feature", undefined] });

    await run();

    assert.ok(!executor.calls.some((c) => c.args[0] === "worktree"), "no worktree added");
    assert.ok(ui.calls.some((c) => c.kind === "notify" && c.message === "Cancelled"));
  });

  it("cancels when the base-branch selector is dismissed", async () => {
    const { executor, ui, run } = harness({ selectResult: null });

    await run();

    assert.ok(!executor.calls.some((c) => c.args[0] === "worktree"), "no worktree added");
    assert.ok(ui.calls.some((c) => c.kind === "notify" && c.message === "Cancelled"));
  });

  it("cancels when the branch-name prompt is dismissed", async () => {
    const { executor, ui, run } = harness({ inputResults: [undefined] });

    await run();

    assert.ok(!executor.calls.some((c) => c.args[0] === "worktree"), "no worktree added");
    assert.ok(ui.calls.some((c) => c.kind === "notify" && c.message === "Cancelled — no name provided"));
  });

  it("notifies with an actionable message when git refuses", async () => {
    const { ui, run } = harness({
      inputResults: ["my-feature", ""],
      worktreeError: "fatal: '/src/app-my-feature' already exists",
    });

    await run();

    assert.ok(
      ui.calls.some(
        (c) =>
          c.kind === "notify" &&
          c.type === "error" &&
          c.message ===
            'Failed to create worktree: Worktree path "/src/app-my-feature" already exists — choose another path, then retry.',
      ),
      "notified the mapped git error",
    );
  });

  it("does not create anything when the confirmation is declined", async () => {
    const { executor, ui, run } = harness({
      inputResults: ["my-feature", ""],
      confirmResult: false,
    });

    await run();

    assert.ok(!executor.calls.some((c) => c.args[0] === "worktree"), "no worktree added");
    assert.ok(ui.calls.some((c) => c.kind === "notify" && c.message === "Cancelled"));
  });
});
