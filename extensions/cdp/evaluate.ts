/**
 * cdp_evaluate tool — run arbitrary JavaScript in the browser page.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { attachToTarget, cdpSend, findTarget, getConnection } from "./connection.ts";

export function registerEvaluate(pi: ExtensionAPI) {
  pi.registerTool({
    name: "cdp_evaluate",
    label: "CDP Evaluate",
    description: "Run arbitrary JavaScript in the browser page and get the result.",
    parameters: Type.Object({
      urlFilter: Type.String({ description: "Filter to find the right tab" }),
      expression: Type.String({ description: "JavaScript expression to evaluate" }),
    }),
    async execute(_toolCallId, params) {
      const connection = getConnection();
      if (!connection) {
        return { content: [{ type: "text", text: "Not connected to CDP. Use cdp_connect first." }], details: {} };
      }
      try {
        const targetId = await findTarget(connection, params.urlFilter);
        if (!targetId) {
          return { content: [{ type: "text", text: `No target found matching "${params.urlFilter}".` }], details: {} };
        }
        const sessionId = await attachToTarget(connection, targetId);

        const result = (await cdpSend(connection, "Runtime.evaluate", {
          sessionId,
          expression: params.expression,
          returnByValue: true,
        })) as { result: { value: unknown; type: string } };

        return {
          content: [{ type: "text", text: `Result: ${JSON.stringify(result?.result?.value ?? result, null, 2)}` }],
          details: { raw: result },
        };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], details: { isError: true } };
      }
    },
  });
}
