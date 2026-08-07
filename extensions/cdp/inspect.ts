/**
 * cdp_inspect tool — navigate a browser tab to a URL, wait for it to load,
 * and return console errors, page text, and CSS info.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { attachToTarget, cdpSend, findTarget, getConnection } from "./connection.ts";

/** Register the cdp_inspect tool. */
export function registerInspect(pi: ExtensionAPI) {
  pi.registerTool({
    name: "cdp_inspect",
    label: "CDP Inspect",
    description: "Navigate a browser tab to a URL, wait for it to load, and return console errors, page text, and CSS info.",
    parameters: Type.Object({
      urlFilter: Type.String({ description: "Filter to find the right tab (e.g., '6006' for Storybook)" }),
      targetUrl: Type.String({ description: "URL to navigate to" }),
      waitMs: Type.Optional(Type.Number({ description: "Milliseconds to wait after page load (default: 3000)" })),
    }),
    async execute(_toolCallId, params) {
      const connection = getConnection();
      if (!connection) {
        return { content: [{ type: "text", text: "Not connected to CDP. Use cdp_connect first." }], details: {} };
      }
      try {
        // Find the target
        let targetId = await findTarget(connection, params.urlFilter);
        if (!targetId) {
          return {
            content: [{ type: "text", text: `No target found matching "${params.urlFilter}". Use cdp_list_targets first.` }],
            details: {},
          };
        }

        // Attach to it
        const sessionId = await attachToTarget(connection, targetId);

        // Enable console
        await cdpSend(connection, "Runtime.enable", { sessionId });

        // Collect console messages
        const consoleErrors: Array<{ level: string; text: string }> = [];
        const consoleHandler = (data: Buffer) => {
          try {
            const msg = JSON.parse(data.toString());
            if (msg.method === "Runtime.consoleAPICalled" && msg.params?.args) {
              const args = msg.params.args.map((a: { value?: string; type: string }) => a.value ?? a.type).join(" ");
              if (msg.params.level === "error") {
                consoleErrors.push({ level: "error", text: args });
              }
            }
            if (msg.method === "Runtime.exceptionThrown") {
              const exc = msg?.params?.exceptionDetails?.exception;
              if (exc) {
                consoleErrors.push({ level: "exception", text: exc.description || exc.value || JSON.stringify(exc) });
              }
            }
          } catch {
            // ignore
          }
        };
        connection.ws.on("message", consoleHandler);

        // Navigate
        await cdpSend(connection, "Page.navigate", { url: params.targetUrl, sessionId });

        // Wait
        await new Promise((r) => setTimeout(r, params.waitMs ?? 3000));

        // Remove console handler
        connection.ws.off("message", consoleHandler);

        // Evaluate: get page text and CSS info
        const evalResult = (await cdpSend(connection, "Runtime.evaluate", {
          sessionId,
          expression: `(function() {
            var result = {
              bodyText: document.body?.innerText?.substring(0, 1000) || '',
              styleTags: [],
              globalsCssFound: false,
              bodyStyles: {}
            };

            // Check style tags
            var styles = document.querySelectorAll('style');
            for (var i = 0; i < styles.length; i++) {
              var text = styles[i].textContent || '';
              result.styleTags.push({ len: text.length, preview: text.substring(0, 100) });
              if (text.includes('--background') || text.includes('--foreground')) {
                result.globalsCssFound = true;
              }
            }

            // Body computed styles
            var s = getComputedStyle(document.body);
            result.bodyStyles = {
              fontFamily: s.fontFamily,
              color: s.color,
              backgroundColor: s.backgroundColor
            };

            return result;
          })()`,
          returnByValue: true,
        })) as { result: { value: Record<string, unknown> } };

        const pageInfo = evalResult?.result?.value || {};

        // Format output
        let output = `## Page Inspection Results\n\n`;
        output += `**URL:** ${params.targetUrl}\n\n`;
        output += `### Body Text (first 1000 chars)\n${(pageInfo as { bodyText?: string }).bodyText || "(empty)"}\n\n`;

        if (consoleErrors.length > 0) {
          output += `### Console Errors (${consoleErrors.length})\n`;
          for (const err of consoleErrors) {
            output += `- [${err.level}] ${err.text.substring(0, 300)}\n`;
          }
        } else {
          output += `### Console Errors\nNone\n`;
        }

        output += `\n### globals.css Injected\n${(pageInfo as { globalsCssFound?: boolean }).globalsCssFound ? "YES" : "NO"}\n`;
        output += `\n### Style Tags (${(pageInfo as { styleTags?: Array<{ len: number }> }).styleTags?.length || 0})\n`;
        output += `\n### Body Computed Styles\`\`\`json\n${JSON.stringify((pageInfo as { bodyStyles?: Record<string, string> }).bodyStyles, null, 2)}\n\`\`\``;

        return {
          content: [{ type: "text", text: output }],
          details: { consoleErrors, pageInfo },
        };
      } catch (e) {
        return { content: [{ type: "text", text: `Error: ${(e as Error).message}` }], details: { isError: true } };
      }
    },
  });
}
