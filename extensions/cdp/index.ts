/**
 * Chrome DevTools Protocol (CDP) Debug Extension
 *
 * Provides tools to connect to Chrome via CDP, inspect the DOM,
 * check console errors, and evaluate JavaScript in the browser.
 *
 * One file per tool: connect.ts, list-targets.ts, inspect.ts,
 * evaluate.ts, disconnect.ts. Shared connection state lives in
 * connection.ts.
 *
 * Prerequisites: Chrome launched with --remote-debugging-port=9222
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerConnect } from "./connect.ts";
import { registerDisconnect } from "./disconnect.ts";
import { registerEvaluate } from "./evaluate.ts";
import { registerInspect } from "./inspect.ts";
import { registerListTargets } from "./list-targets.ts";

export default function (pi: ExtensionAPI) {
  registerConnect(pi);
  registerListTargets(pi);
  registerInspect(pi);
  registerEvaluate(pi);
  registerDisconnect(pi);
}
