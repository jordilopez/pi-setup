/**
 * Chrome DevTools Protocol (CDP) Debug Extension
 *
 * Provides tools to connect to Chrome via CDP, inspect the DOM,
 * check console errors, and evaluate JavaScript in the browser.
 *
 * Prerequisites: Chrome launched with --remote-debugging-port=9222
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import WebSocket from "ws";

interface CDPConnection {
  ws: WebSocket;
  pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
  msgId: number;
}

let connection: CDPConnection | null = null;

function connectCDP(wsUrl: string): Promise<CDPConnection> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map();
    let msgId = 0;

    ws.on("open", () => {
      const conn: CDPConnection = { ws, pending, msgId: 0 };
      connection = conn;
      resolve(conn);
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.id !== undefined && pending.has(msg.id)) {
          const { resolve: res, reject: rej } = pending.get(msg.id)!;
          pending.delete(msg.id);
          if (msg.error) rej(new Error(msg.error.message));
          else res(msg.result);
        }
      } catch (e) {
        // ignore parse errors
      }
    });

    ws.on("error", reject);
    ws.on("close", () => {
      connection = null;
    });
  });
}

async function cdpSend(conn: CDPConnection, method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    conn.msgId++;
    const id = conn.msgId;
    conn.pending.set(id, { resolve, reject });
    conn.ws.send(JSON.stringify({ id, method, params }));
  });
}

async function findTarget(conn: CDPConnection, urlFilter: string): Promise<string | null> {
  const targets = (await cdpSend(conn, "Target.getTargets")) as { targetInfos: Array<{ targetId: string; url: string }> };
  const target = targets.targetInfos.find((t) => t.url.includes(urlFilter));
  return target?.targetId ?? null;
}

async function attachToTarget(conn: CDPConnection, targetId: string): Promise<string> {
  const result = (await cdpSend(conn, "Target.attachToTarget", {
    targetId,
    flatten: true,
  })) as { sessionId: string };
  return result.sessionId;
}

export default function cdpDebugExtension(pi: ExtensionAPI) {
  // Tool: Connect to Chrome CDP
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

  // Tool: List available targets (tabs/pages)
  pi.registerTool({
    name: "cdp_list_targets",
    label: "CDP List Targets",
    description: "List all available browser targets (tabs, iframes) from the CDP connection.",
    parameters: Type.Object({}),
    async execute() {
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

  // Tool: Open URL and check for errors
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

  // Tool: Run JavaScript in the browser
  pi.registerTool({
    name: "cdp_evaluate",
    label: "CDP Evaluate",
    description: "Run arbitrary JavaScript in the browser page and get the result.",
    parameters: Type.Object({
      urlFilter: Type.String({ description: "Filter to find the right tab" }),
      expression: Type.String({ description: "JavaScript expression to evaluate" }),
    }),
    async execute(_toolCallId, params) {
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

  // Tool: Disconnect from CDP
  pi.registerTool({
    name: "cdp_disconnect",
    label: "CDP Disconnect",
    description: "Disconnect from the Chrome CDP session.",
    parameters: Type.Object({}),
    async execute() {
      if (connection) {
        connection.ws.close();
        connection = null;
        return { content: [{ type: "text", text: "Disconnected from Chrome CDP." }], details: {} };
      }
      return { content: [{ type: "text", text: "Not connected." }], details: {} };
    },
  });
}
