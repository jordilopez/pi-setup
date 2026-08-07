/**
 * cdp_connect tool — connect to a Chrome instance via CDP WebSocket.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { connectCDP } from "./connection.ts";

/** Register the cdp_connect tool. */
export function registerConnect(pi: ExtensionAPI) {
  pi.registerTool({
    name: "cdp_connect",
    label: "CDP Connect",
    description: "Connect to Chrome via CDP WebSocket (ws://127.0.0.1:9222/...).",
    parameters: Type.Object({
      wsUrl: Type.String({ description: "WebSocket URL (e.g., ws://127.0.0.1:9222/devtools/browser/...)" }),
    }),
    async execute(_toolCallId, params) {
      try {
        await connectCDP(params.wsUrl);
        return {
          content: [{ type: "text", text: "Connected to Chrome CDP successfully." }],
          details: {},
        };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Failed to connect: ${(e as Error).message}` }],
          details: { isError: true },
        };
      }
    },
  });
}
