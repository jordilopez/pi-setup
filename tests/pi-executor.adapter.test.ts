/**
 * Adapter test: `PiExecutor` delegates `run()` to `pi.exec` unchanged.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { PiExecutor } from "../extensions/git/adapters/pi/executor.ts";

describe("PiExecutor", () => {
  it("delegates run() to pi.exec with the same arguments and returns its result", async () => {
    const calls: { command: string; args: string[]; options?: unknown }[] = [];
    const fakePi = {
      exec: async (command: string, args: string[], options?: unknown) => {
        calls.push({ command, args, options });
        return { stdout: "ok", stderr: "", code: 0, killed: false };
      },
    };

    const executor = PiExecutor(fakePi as unknown as ExtensionAPI);
    const result = await executor.run("git", ["status"], { cwd: "/repo", signal: undefined });

    assert.equal(result.stdout, "ok");
    assert.equal(result.code, 0);
    assert.deepEqual(calls, [{ command: "git", args: ["status"], options: { cwd: "/repo", signal: undefined } }]);
  });

  it("passes through non-zero exit codes and stderr", async () => {
    const fakePi = {
      exec: async () => ({ stdout: "", stderr: "boom", code: 128, killed: false }),
    };

    const result = await PiExecutor(fakePi as unknown as ExtensionAPI).run("git", ["bad"], { cwd: "/repo" });

    assert.equal(result.code, 128);
    assert.equal(result.stderr, "boom");
  });
});
