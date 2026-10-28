/**
 * Unit tests for the `Executor` and `Ui` outbound ports and their fakes.
 *
 * These tests pin the port contracts before any domain code migrates onto
 * them: the executor records calls in order and mirrors `ExtensionAPI.exec`
 * cancellation, and the UI fake models cancellation via `undefined` while
 * recording every interaction.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { FakeExecutor } from "./support/fake-executor.ts";
import { FakeUi } from "./support/fake-ui.ts";

describe("FakeExecutor", () => {
  it("records calls in order with their command and args", async () => {
    const executor = new FakeExecutor();
    await executor.run("git", ["status"], { cwd: "/repo" });
    await executor.run("gh", ["pr", "view", "main"], { cwd: "/repo" });

    assert.equal(executor.calls.length, 2);
    assert.equal(executor.calls[0].command, "git");
    assert.deepEqual(executor.calls[0].args, ["status"]);
    assert.equal(executor.calls[1].command, "gh");
    assert.deepEqual(executor.calls[1].args, ["pr", "view", "main"]);
  });

  it("uses the handler over the default result", async () => {
    const executor = new FakeExecutor();
    executor.setHandler((command, args) =>
      command === "gh" && args[0] === "pr" && args[1] === "view"
        ? { stdout: "OPEN\n", stderr: "", code: 0, killed: false }
        : { stdout: "", stderr: "unexpected", code: 1, killed: false },
    );
    executor.setDefault({ stdout: "", stderr: "fallback", code: 2, killed: false });

    assert.equal((await executor.run("gh", ["pr", "view"], { cwd: "/repo" })).stdout, "OPEN\n");
  });

  it("falls back to the default result when no handler is set", async () => {
    const executor = new FakeExecutor();
    executor.setDefault({ stdout: "fallback", stderr: "", code: 0, killed: false });

    assert.equal((await executor.run("gh", ["pr", "list"], { cwd: "/repo" })).stdout, "fallback");
  });

  it("prefers the handler over the default when both are set", async () => {
    const executor = new FakeExecutor();
    executor.setDefault({ stdout: "fallback", stderr: "", code: 0, killed: false });
    executor.setHandler((command) =>
      command === "git"
        ? { stdout: "git", stderr: "", code: 0, killed: false }
        : { stdout: "handled", stderr: "", code: 0, killed: false },
    );

    assert.equal((await executor.run("git", ["status"], { cwd: "/repo" })).stdout, "git");
    assert.equal((await executor.run("gh", ["pr", "list"], { cwd: "/repo" })).stdout, "handled");
  });

  it("rejects with AbortError when the signal is already aborted", async () => {
    const executor = new FakeExecutor();
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(executor.run("git", ["status"], { cwd: "/repo", signal: controller.signal }), {
      name: "AbortError",
    });
  });

  it("rejects with AbortError when the signal fires mid-flight", async () => {
    const executor = new FakeExecutor();
    const controller = new AbortController();

    const pending = executor.run("git", ["status"], { cwd: "/repo", signal: controller.signal });
    controller.abort();

    await assert.rejects(pending, { name: "AbortError" });
  });
});

describe("FakeUi", () => {
  it("models cancellation with undefined from select and input", async () => {
    const ui = new FakeUi();
    assert.equal(await ui.select("Pick", ["a", "b"]), undefined);
    assert.equal(await ui.input("Name"), undefined);
  });

  it("records every interaction with the right kind and payload", async () => {
    const ui = new FakeUi();
    ui.selectResult = "b";
    ui.confirmResult = true;
    ui.inputResult = "feature/x";

    await ui.select("Pick", ["a", "b"]);
    await ui.confirm("Go?", "yes or no");
    await ui.input("Name", "placeholder");
    ui.notify("done", "info");

    assert.equal(ui.calls.length, 4);
    assert.deepEqual(ui.calls[0], { kind: "select", title: "Pick", options: ["a", "b"] });
    assert.deepEqual(ui.calls[1], { kind: "confirm", title: "Go?", message: "yes or no" });
    assert.equal(ui.calls[3].kind, "notify");
  });
});
