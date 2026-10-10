/**
 * Unit tests for the validation helpers in `extensions/git/create-pr.ts`:
 * `assertPrBranch`, `assertValidRef`, and `resolveBase`.
 *
 * These helpers shell out to git, so the tests drive them with a fake `pi`
 * whose `exec` mimics `git check-ref-format`, `git show-ref --verify`, and
 * fails loudly on unexpected commands. The critical properties under test:
 * trunk branches and detached HEAD are refused, option-like names are rejected
 * before any git call, and the base fallback is `master` then `main`.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { assertPrBranch, assertValidRef, resolveBase } from "../extensions/git/create-pr.ts";

/** Local branch heads the fake `git show-ref --verify` reports. */
interface FakeRepo {
  heads: string[];
  /** Preferred `git check-ref-format` verdict; valid ref names get code 0. */
  validRefPattern?: RegExp;
}

/** Fake pi plus a record of every exec call for "git was never consulted" assertions. */
interface Fake {
  pi: ExtensionAPI;
  calls: { command: string; args: string[] }[];
}

const CWD = "/repo";

function createFakePi(repo: FakeRepo): Fake {
  const calls: { command: string; args: string[] }[] = [];

  const exec = async (command: string, args: string[]) => {
    calls.push({ command, args });
    if (command === "git" && args[0] === "check-ref-format" && args[1] === "--branch") {
      const ref = args[2];
      const valid = repo.validRefPattern ?? /^[a-zA-Z0-9][a-zA-Z0-9._/-]*$/;
      if (!ref.startsWith("-") && valid.test(ref)) return { code: 0, stdout: "", stderr: "" };
      return { code: 128, stdout: "", stderr: "fatal: Not a valid branch point" };
    }
    if (command === "git" && args[0] === "show-ref" && args[1] === "--verify") {
      const ref = args[3]; // ["show-ref", "--verify", "--quiet", "refs/heads/<name>"]
      return repo.heads.includes(ref.replace("refs/heads/", ""))
        ? { code: 0, stdout: "", stderr: "" }
        : { code: 128, stdout: "", stderr: "fatal: not a valid ref" };
    }
    throw new Error(`Fake pi cannot handle: ${command} ${args.join(" ")}`);
  };

  // The helpers only touch `pi.exec`; the rest of ExtensionAPI is irrelevant
  // here and missing at runtime, so the cast covers the unused surface.
  const pi = { exec } as unknown as ExtensionAPI;
  return { pi, calls };
}

/** Helper signature is positional: (pi, value, cwd, signal). */
const assertBranch = (fake: Fake, branch: string) => assertPrBranch(fake.pi, branch, CWD, undefined);

const assertRef = (fake: Fake, ref: string, label: string) => assertValidRef(fake.pi, ref, label, CWD, undefined);

const pickBase = (fake: Fake, explicit?: string) => resolveBase(fake.pi, explicit, CWD, undefined);

describe("assertPrBranch", () => {
  it("accepts a normal feature branch", async () => {
    await assert.doesNotReject(assertBranch(createFakePi({ heads: ["master"] }), "feature/x"));
  });

  it("refuses a detached HEAD (empty branch name)", async () => {
    await assert.rejects(assertBranch(createFakePi({ heads: [] }), ""), /Not on a branch \(detached HEAD\?\)/);
  });

  it("refuses every trunk branch", async () => {
    for (const trunk of ["master", "main", "develop"]) {
      await assert.rejects(assertBranch(createFakePi({ heads: [] }), trunk), new RegExp(`trunk branch '${trunk}'`));
    }
  });

  it("rejects an option-like branch name without consulting git", async () => {
    const fake = createFakePi({ heads: [] });
    await assert.rejects(assertBranch(fake, "--upload-pack=evil"), /Unsafe branch name/);
    assert.ok(!fake.calls.some((call) => call.args.includes("check-ref-format")), "git must stay untouched");
  });

  it("rejects a name git refuses to validate", async () => {
    const fake = createFakePi({ heads: [], validRefPattern: /^\d+$/ });
    await assert.rejects(assertBranch(fake, "bad name"), /Unsafe branch name/);
  });
});

describe("assertValidRef", () => {
  it("accepts a valid ref", async () => {
    await assert.doesNotReject(assertRef(createFakePi({ heads: [] }), "feature/x", "branch name"));
  });

  it("rejects an option-like ref before consulting git", async () => {
    const fake = createFakePi({ heads: [] });
    await assert.rejects(assertRef(fake, "-c=evil", "branch name"), /Unsafe branch name/);
    assert.equal(fake.calls.length, 0);
  });

  it("uses the given label in the error", async () => {
    const fake = createFakePi({ heads: [] });
    await assert.rejects(assertRef(fake, "-x", "base branch"), /Unsafe base branch: '-x'/);
    await assert.rejects(assertRef(fake, "-x", "branch name"), /Unsafe branch name: '-x'/);
  });
});

describe("resolveBase", () => {
  it("prefers master when it exists locally", async () => {
    assert.equal(await pickBase(createFakePi({ heads: ["master", "main"] })), "master");
  });

  it("falls back to main when only main exists", async () => {
    assert.equal(await pickBase(createFakePi({ heads: ["main"] })), "main");
  });

  it("refuses when neither master nor main exists", async () => {
    await assert.rejects(pickBase(createFakePi({ heads: ["develop"] })), /No `master` or `main` branch found/);
  });

  it("honors an explicit base without probing local branches", async () => {
    const fake = createFakePi({ heads: ["master", "main"] });
    assert.equal(await pickBase(fake, "develop"), "develop");
    assert.ok(!fake.calls.some((call) => call.args.includes("show-ref")), "must not probe local heads");
  });

  it("validates an explicit base like any other ref", async () => {
    const fake = createFakePi({ heads: ["main"] });
    await assert.rejects(pickBase(fake, "--bare"), /Unsafe base branch/);
  });
});
