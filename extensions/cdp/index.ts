/**
 * CDP Extension
 *
 * Chrome DevTools Protocol browser automation (namespace `cdp`):
 * - tools: `cdp_connect`, `cdp_goto`, `cdp_query`, `cdp_eval`, `cdp_screenshot`, …
 * - commands: `/cdp:connect`, `/cdp:disconnect`, `/cdp:console`
 *
 * No puppeteer needed - uses CDP's WebSocket API directly.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerCdpTools } from "./adapters/pi/register.ts";

export default function (pi: ExtensionAPI) {
  registerCdpTools(pi, parsePortFromArgs());
}

/** Parse `--port <n>` from the CLI args, falling back to the CDP default. */
function parsePortFromArgs(): number {
  const args = process.argv.slice(2);
  const portIndex = args.indexOf("--port");
  return portIndex !== -1 && args[portIndex + 1] ? parseInt(args[portIndex + 1], 10) : 9222;
}
