import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";

import type { Ui } from "../../ports/ui.ts";

/**
 * Production adapter: satisfies the `Ui` outbound port by delegating to Pi's
 * TUI surface (`ExtensionUIContext`). `undefined` from `select`/`input` is the
 * cancellation signal, matching both the port and the Pi API.
 */
export function PiUi(ui: Pick<ExtensionUIContext, "select" | "confirm" | "input" | "notify">): Ui {
  return {
    select: (title, options) => ui.select(title, options),
    confirm: (title, message) => ui.confirm(title, message),
    input: (title, placeholder) => ui.input(title, placeholder),
    notify: (message, type) => ui.notify(message, type),
  };
}
