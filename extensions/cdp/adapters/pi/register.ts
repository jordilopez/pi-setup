/**
 * CDP adapter wiring: build the transport + console store, connect them, and
 * register the tools, slash commands, and lifecycle hooks.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { formatConsoleApiCall } from "../../domain/console-format.ts";
import { createConsoleStore, MAX_CONSOLE_LOGS } from "../../domain/console-store.ts";
import { NodePathFs } from "./node-fs.ts";
import { createCdpTools } from "./tools.ts";
import { WebSocketCdpTransport } from "./web-socket-transport.ts";

export function registerCdpTools(pi: ExtensionAPI, initialPort: number): void {
  const transport = new WebSocketCdpTransport();
  const store = createConsoleStore(MAX_CONSOLE_LOGS);

  // Route console events into the store; clear the store on a fresh connection.
  transport.onConsoleEvent((params) => store.push(formatConsoleApiCall(params)));
  transport.onConnect(() => store.clear());

  const tools = createCdpTools({ transport, store, pathFs: NodePathFs, initialPort });

  for (const tool of Object.values(tools)) {
    pi.registerTool(tool);
  }

  // Commands for quick access.
  pi.registerCommand("cdp:connect", {
    description: "Connect to Chrome browser via CDP",
    handler: async (args) => {
      await tools.connect.execute("cmd", args ? { port: parseInt(args, 10) } : {});
    },
  });

  pi.registerCommand("cdp:disconnect", {
    description: "Disconnect from Chrome browser",
    handler: async () => {
      transport.close();
    },
  });

  pi.registerCommand("cdp:console", {
    description: "Get browser console logs",
    handler: async () => {
      await tools.console.execute("cmd", {});
    },
  });

  pi.registerCommand("cdp:viewport", {
    description: "Set the CDP layout viewport (e.g. /cdp:viewport 1440 900)",
    handler: async (args) => {
      const [rawWidth, rawHeight] = args.trim().split(/\s+/u);
      const width = rawWidth ? parseInt(rawWidth, 10) : undefined;
      const height = rawHeight ? parseInt(rawHeight, 10) : undefined;
      await tools.viewport.execute("cmd", { width, height });
    },
  });

  // Status on load.
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify(`Browser DevTools ready. Use /cdp:connect to connect to Chrome.`, "info");
  });

  // Cleanup on shutdown.
  pi.on("session_shutdown", () => {
    transport.close();
  });
}
