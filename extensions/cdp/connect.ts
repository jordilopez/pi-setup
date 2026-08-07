/**
 * cdp_connect tool — connect to a Chrome instance via CDP WebSocket.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { connectCDP } from "./connection.ts";

export function registerConnect(pi: ExtensionAPI) {
  pi.registerTool({
    name: "cdp_connect",
    label: "CDP Connect",
    description: "Connect to a Chrome instance via CDP WebSocket. Use ws://127.0.0.1:9222/... URL from chrome's debugging port.",
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
