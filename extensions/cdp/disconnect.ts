/**
 * cdp_disconnect tool — close the active CDP session.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { disconnectCDP } from "./connection.ts";

export function registerDisconnect(pi: ExtensionAPI) {
  pi.registerTool({
    name: "cdp_disconnect",
    label: "CDP Disconnect",
    description: "Disconnect from the Chrome CDP session.",
    parameters: Type.Object({}),
    async execute() {
      if (disconnectCDP()) {
        return { content: [{ type: "text", text: "Disconnected from Chrome CDP." }], details: {} };
      }
      return { content: [{ type: "text", text: "Not connected." }], details: {} };
    },
  });
}
