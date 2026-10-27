/**
 * Unit tests for the validation helpers in `extensions/git/domain/create-pr.ts`:
 * `assertPrBranch`, `assertValidRef`, and `resolveBase`.
 *
 * These helpers reach git only through the `Executor` port, so the tests drive
 * them with a `FakeExecutor` whose handler mimics `git check-ref-format` and
 * `git show-ref --verify` and fails loudly on unexpected commands. The critical
 * properties under test: trunk branches and detached HEAD are refused,
 * option-like names are rejected before any git call, and the base fallback is
 * `master` then `main`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { assertPrBranch, assertValidRef, resolveBase } from "../extensions/git/domain/create-pr.ts";
import { FakeExecutor } from "./__support__/git/fake-executor.ts";

const CWD = "/repo";

/** Local branch heads the fake `git show-ref --verify` reports. */
interface FakeRepo {
  heads: string[];
  /** Preferred `git check-ref-format` verdict; valid ref names get code 0. */
  validRefPattern?: RegExp;
}

/** Fake executor mimicking the subset of git the PR validators call. */
function createExecutor(repo: FakeRepo): FakeExecutor {
  const executor = new FakeExecutor();
  executor.setHandler((command, args) => {
    if (command === "git" && args[0] === "check-ref-format" && args[1] === "--branch") {
      const ref = args[2];
      const valid = !ref.startsWith("-") && (repo.validRefPattern ?? /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/).test(ref);
      return valid
        ? { stdout: "", stderr: "", code: 0, killed: false }
        : { stdout: "", stderr: "fatal: Not a valid branch point", code: 128, killed: false };
    }
    if (command === "git" && args[0] === "show-ref" && args[1] === "--verify") {
      const name = args[3].replace("refs/heads/", "");
      return repo.heads.includes(name)
        ? { stdout: "", stderr: "", code: 0, killed: false }
        : { stdout: "", stderr: "fatal: not a valid ref", code: 128, killed: false };
    }
    throw new Error(`FakeExecutor cannot handle: ${command} ${args.join(" ")}`);
  });
  return executor;
}

/** Helper signature is positional: (executor, value, cwd, signal). */
const pickBase = (executor: FakeExecutor, explicit?: string) => resolveBase(executor, explicit, CWD, undefined);

describe("assertPrBranch", () => {
  it("accepts a normal feature branch", async () => {
    await assert.doesNotReject(assertPrBranch(createExecutor({ heads: ["master"] }), "feature/x", CWD, undefined));
  });

  it("refuses a detached HEAD (empty branch name)", async () => {
    await assert.rejects(
      assertPrBranch(createExecutor({ heads: [] }), "", CWD, undefined),
      /Not on a branch \(detached HEAD\?\)/,
    );
  });

  it("refuses every trunk branch", async () => {
    for (const trunk of ["master", "main", "develop"]) {
      await assert.rejects(
        assertPrBranch(createExecutor({ heads: [] }), trunk, CWD, undefined),
        new RegExp(`trunk branch '${trunk}'`),
      );
    }
  });

  it("rejects an option-like branch name without consulting git", async () => {
    const executor = createExecutor({ heads: [] });
    await assert.rejects(assertPrBranch(executor, "--upload-pack=evil", CWD, undefined), /Unsafe branch name/);
    assert.ok(!executor.calls.some((call) => call.args.includes("check-ref-format")), "git must stay untouched");
  });

  it("rejects a name git refuses to validate", async () => {
    const executor = createExecutor({ heads: [], validRefPattern: /^\d+$/ });
    await assert.rejects(assertPrBranch(executor, "bad name", CWD, undefined), /Unsafe branch name/);
  });
});

describe("assertValidRef", () => {
  it("accepts a valid ref", async () => {
    await assert.doesNotReject(
      assertValidRef(createExecutor({ heads: [] }), "feature/x", "branch name", CWD, undefined),
    );
  });

  it("rejects an option-like ref before consulting git", async () => {
    const executor = createExecutor({ heads: [] });
    await assert.rejects(assertValidRef(executor, "-c=evil", "branch name", CWD, undefined), /Unsafe branch name/);
    assert.equal(executor.calls.length, 0);
  });

  it("uses the given label in the error", async () => {
    const executor = createExecutor({ heads: [] });
    await assert.rejects(assertValidRef(executor, "-x", "base branch", CWD, undefined), /Unsafe base branch: '-x'/);
    await assert.rejects(assertValidRef(executor, "-x", "branch name", CWD, undefined), /Unsafe branch name: '-x'/);
  });
});

describe("resolveBase", () => {
  it("prefers master when it exists locally", async () => {
    assert.equal(await pickBase(createExecutor({ heads: ["master", "main"] })), "master");
  });

  it("falls back to main when only main exists", async () => {
    assert.equal(await pickBase(createExecutor({ heads: ["main"] })), "main");
  });

  it("refuses when neither master nor main exists", async () => {
    await assert.rejects(pickBase(createExecutor({ heads: ["develop"] })), /No `master` or `main` branch found/);
  });

  it("honors an explicit base without probing local branches", async () => {
    const executor = createExecutor({ heads: ["master", "main"] });
    assert.equal(await pickBase(executor, "develop"), "develop");
    assert.ok(!executor.calls.some((call) => call.args.includes("show-ref")), "must not probe local heads");
  });

  it("validates an explicit base like any other ref", async () => {
    const executor = createExecutor({ heads: ["main"] });
    await assert.rejects(pickBase(executor, "--bare"), /Unsafe base branch/);
  });
});
