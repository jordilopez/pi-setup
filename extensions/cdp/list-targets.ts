/**
 * cdp_list_targets tool — list all available browser targets (tabs, iframes).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { cdpSend, getConnection } from "./connection.ts";

/** Register the cdp_list_targets tool. */
export function registerListTargets(pi: ExtensionAPI) {
  pi.registerTool({
    name: "cdp_list_targets",
    label: "CDP List Targets",
    description: "List all available browser targets (tabs, iframes) from the CDP connection.",
    parameters: Type.Object({}),
    async execute() {
      const connection = getConnection();
      if (!connection) {
        return { content: [{ type: "text", text: "Not connected to CDP. Use cdp_connect first." }], details: {} };
      }
      try {
        const targets = (await cdpSend(connection, "Target.getTargets")) as {
          targetInfos: Array<{ targetId: string; url: string; title: string }>;
        };
        const list = targets.targetInfos
          .map((t) => `- ${t.title || "(no title)"}\n  URL: ${t.url}\n  ID: ${t.targetId}`)
          .join("\n");
        return {
          content: [{ type: "text", text: `Available targets:\n${list}` }],
          details: { targets: targets.targetInfos },
        };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], details: { isError: true } };
      }
    },
  });
}
