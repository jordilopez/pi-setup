/**
 * Adapter test: `PiUi` maps the `Ui` port onto the Pi TUI surface unchanged,
 * and `undefined` from `select`/`input` flows through as the cancellation
 * signal.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";

import { PiUi } from "../extensions/git/adapters/pi/ui.ts";

type UiSurface = Pick<ExtensionUIContext, "select" | "confirm" | "input" | "notify">;

describe("PiUi", () => {
  it("maps select/confirm/input/notify onto the Pi ui surface", async () => {
    const calls: unknown[] = [];
    const fakeUi: UiSurface = {
      select: async (title, options) => {
        calls.push(["select", title, options]);
        return "picked";
      },
      confirm: async (title, message) => {
        calls.push(["confirm", title, message]);
        return true;
      },
      input: async (title, placeholder) => {
        calls.push(["input", title, placeholder]);
        return "typed";
      },
      notify: (message, type) => {
        calls.push(["notify", message, type]);
      },
    };

    const ui = PiUi(fakeUi);

    assert.equal(await ui.select("Pick", ["a"]), "picked");
    assert.equal(await ui.confirm("Go?", "yes?"), true);
    assert.equal(await ui.input("Name", "ph"), "typed");
    ui.notify("done", "info");

    assert.equal(calls.length, 4);
    assert.deepEqual(calls[3], ["notify", "done", "info"]);
  });

  it("propagates undefined from select as the cancellation signal", async () => {
    const ui = PiUi({
      select: async () => undefined,
      confirm: async () => false,
      input: async () => undefined,
      notify: () => {},
    });

    assert.equal(await ui.select("Pick", ["a"]), undefined);
  });
});
