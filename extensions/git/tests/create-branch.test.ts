/**
 * Unit + integration tests for the migrated `/git:create-branch` flow:
 * `toKebabCase`, `decideCreateBranch` (validation → checkout plan), and
 * `runCreateBranchPlan` (execution + failure interpretation), plus a synthetic
 * end-to-end drive through the registered command using `FakeUi` +
 * `FakeExecutor`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import { registerCreateBranch } from "../adapters/pi/create-branch.ts";
import { toKebabCase } from "../domain/branch-policy.ts";
import { decideCreateBranch, runCreateBranchPlan } from "../domain/create-branch.ts";
import { FakeExecutor } from "./support/fake-executor.ts";
import { FakeUi } from "./support/fake-ui.ts";

const CWD = "/repo";

describe("toKebabCase", () => {
  it("converts spaces, underscores, and hyphens", () => {
    assert.equal(toKebabCase("My Feature Branch"), "my-feature-branch");
    assert.equal(toKebabCase("fix_bug_422"), "fix-bug-422");
    assert.equal(toKebabCase("  padded  name  "), "padded-name");
  });

  it("splits camelCase and PascalCase", () => {
    assert.equal(toKebabCase("myFeatureBranch"), "my-feature-branch");
    // Consecutive capitals are not split (pre-existing regex behaviour).
    assert.equal(toKebabCase("HTTPServer"), "httpserver");
  });

  it("leaves valid kebab-case alone", () => {
    assert.equal(toKebabCase("already-kebab"), "already-kebab");
  });
});

describe("decideCreateBranch", () => {
  it("returns a checkout plan for a valid request", () => {
    assert.deepEqual(decideCreateBranch({ branchName: "feature/x", baseRef: "main", cwd: CWD }), {
      command: "git",
      args: ["checkout", "-b", "feature/x", "main"],
      cwd: CWD,
      branchName: "feature/x",
      baseRef: "main",
    });
  });

  it("refuses a missing branch name", () => {
    assert.throws(() => decideCreateBranch({ branchName: "", baseRef: "main", cwd: CWD }), /Branch name is required/);
  });

  it("refuses trunk branch names", () => {
    for (const trunk of ["master", "main", "develop"]) {
      assert.throws(
        () => decideCreateBranch({ branchName: trunk, baseRef: "main", cwd: CWD }),
        new RegExp(`Refusing to create branch "${trunk}"`),
      );
    }
  });

  it("refuses unsafe branch names", () => {
    assert.throws(
      () => decideCreateBranch({ branchName: "bad name", baseRef: "main", cwd: CWD }),
      /Unsafe branch name/,
    );
    assert.throws(() => decideCreateBranch({ branchName: "a/../b", baseRef: "main", cwd: CWD }), /Unsafe branch name/);
  });

  it("refuses a missing base ref", () => {
    assert.throws(() => decideCreateBranch({ branchName: "feature/x", baseRef: "", cwd: CWD }), /No base ref provided/);
  });
});

describe("runCreateBranchPlan", () => {
  it("runs the checkout and returns the created branch identity", async () => {
    const executor = new FakeExecutor();
    const plan = decideCreateBranch({ branchName: "feature/x", baseRef: "main", cwd: CWD });

    const result = await runCreateBranchPlan(executor, plan);

    assert.deepEqual(result, { branchName: "feature/x", baseRef: "main", cwd: CWD });
    assert.deepEqual(executor.calls[0].args, ["checkout", "-b", "feature/x", "main"]);
  });

  it("throws an actionable error when the branch already exists", async () => {
    const executor = new FakeExecutor();
    executor.setDefault({
      stdout: "",
      stderr: "fatal: a branch named 'feature/x' already exists",
      code: 128,
      killed: false,
    });

    await assert.rejects(
      runCreateBranchPlan(executor, decideCreateBranch({ branchName: "feature/x", baseRef: "main", cwd: CWD })),
      /Branch "feature\/x" already exists in \/repo — check it out or delete it first/,
    );
  });

  it("throws a descriptive error for any other non-zero exit", async () => {
    const executor = new FakeExecutor();
    executor.setDefault({ stdout: "", stderr: "fatal: something else", code: 128, killed: false });

    await assert.rejects(
      runCreateBranchPlan(executor, decideCreateBranch({ branchName: "feature/x", baseRef: "main", cwd: CWD })),
      /Failed to create branch "feature\/x" from "main" in \/repo: fatal: something else/,
    );
  });
});

describe("registerCreateBranch (synthetic end-to-end)", () => {
  function harness() {
    const executor = new FakeExecutor();
    executor.setHandler((command, args) => {
      if (command === "git" && args[0] === "show-ref" && args[1] === "--verify") {
        const name = args[3].replace("refs/heads/", "");
        // Trunk detection sees master and main, no develop.
        return name === "master" || name === "main"
          ? { stdout: "", stderr: "", code: 0, killed: false }
          : { stdout: "", stderr: "", code: 128, killed: false };
      }
      if (command === "git" && args[0] === "symbolic-ref") {
        return { stdout: "refs/remotes/origin/main\n", stderr: "", code: 0, killed: false };
      }
      if (command === "git" && args[0] === "checkout") {
        return { stdout: "", stderr: "", code: 0, killed: false };
      }
      throw new Error(`unexpected command: ${command} ${args.join(" ")}`);
    });

    const ui = new FakeUi();
    ui.selectResult = "master";
    ui.inputResult = "My Feature Branch";
    ui.confirmResult = true;

    let handler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
    const pi = {
      registerCommand: (_name: string, def: { handler: typeof handler }) => {
        handler = def.handler;
      },
      exec: (command: string, args: string[], options?: unknown) => executor.run(command, args, options as never),
    };

    registerCreateBranch(pi as unknown as ExtensionAPI);

    const ctx = { ui, cwd: CWD, signal: undefined } as unknown as ExtensionCommandContext;

    return { executor, ui, run: () => (handler as NonNullable<typeof handler>)("", ctx) };
  }

  it("detects trunks, kebab-cases the name, checks out, and notifies", async () => {
    const { executor, ui, run } = harness();

    await run();

    const checkout = executor.calls.find((c) => c.args[0] === "checkout");
    assert.ok(checkout, "checkout command ran");
    assert.deepEqual(checkout.args, ["checkout", "-b", "my-feature-branch", "master"]);

    assert.ok(
      ui.calls.some(
        (c) => c.kind === "notify" && c.message === 'Branch "my-feature-branch" created successfully from master',
      ),
      "notified success",
    );
  });
});
