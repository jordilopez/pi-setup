/**
 * The `cdp_*` tool definitions, driven entirely through the ports/domain:
 * `transport` for the browser, `store` for console logs, and `validateScreenshotPath`
 * for the write-safe screenshot location.
 */

import { closeSync, constants as fsConstants, openSync, writeFileSync } from "node:fs";

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type { ConsoleStore } from "../../domain/console-store.ts";
import { ScreenshotPathError, validateScreenshotPath } from "../../domain/path-guard.ts";
import type { PathFs } from "../../ports/fs.ts";
import type { CdpTransport } from "../../ports/transport.ts";

interface CdpToolsDeps {
  transport: CdpTransport;
  store: ConsoleStore;
  pathFs: PathFs;
  initialPort: number;
}

/** Minimal shape the shared error wrapper can return on failure. */
interface ToolFailure {
  content: { type: "text"; text: string }[];
  details: { error: string };
  isError: true;
}

/**
 * Shared error shape for the simple CDP tools: catch, stringify, and report.
 * Tools with additional failure modes (connect's port validation, eval's
 * in-page exceptions, screenshot's path guard) keep their bespoke handling and
 * use this only for the outermost transport failures.
 */
async function tryRunCdpTool<T>(failedLabel: string, run: () => Promise<T>): Promise<T | ToolFailure> {
  try {
    return await run();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `${failedLabel}: ${msg}` }],
      details: { error: msg },
      isError: true,
    };
  }
}

// `satisfies` keeps each tool's precise parameter/execute types while giving
// the content literals the contextual ToolDefinition typing (so `type: "text"`
// stays a literal instead of widening to `string`).
export function createCdpTools(deps: CdpToolsDeps) {
  const { transport, store, pathFs } = deps;
  let currentPort = deps.initialPort;

  const cdpTools = {
    connect: {
      name: "cdp_connect",
      label: "CDP Connect",
      description: "Connect to Chrome browser via DevTools Protocol",
      parameters: Type.Object({
        port: Type.Optional(Type.Number({ description: "Chrome remote debugging port (default: 9222)" })),
      }),
      async execute(_toolCallId: string, params: { port?: number }) {
        if (params.port !== undefined) {
          if (!Number.isInteger(params.port) || params.port < 1 || params.port > 65535) {
            return {
              content: [{ type: "text", text: `Invalid port: ${params.port} (must be 1-65535)` }],
              details: { error: "invalid port" },
              isError: true,
            };
          }
          currentPort = params.port;
        }
        return tryRunCdpTool("Connection failed", async () => {
          await transport.connect(currentPort);
          return {
            content: [{ type: "text", text: `Connected to Chrome on port ${currentPort}` }],
            details: { connected: true, port: currentPort },
          };
        });
      },
    },

    disconnect: {
      name: "cdp_disconnect",
      label: "CDP Disconnect",
      description: "Disconnect from Chrome browser",
      parameters: Type.Object({}),
      async execute() {
        transport.close();
        return {
          content: [{ type: "text", text: "Disconnected from browser" }],
          details: {},
        };
      },
    },

    goto: {
      name: "cdp_goto",
      label: "CDP Goto",
      description: "Navigate to a URL",
      parameters: Type.Object({
        url: Type.String({ description: "URL to navigate to" }),
      }),
      async execute(_toolCallId: string, params: { url: string }) {
        return tryRunCdpTool("Navigation failed", async () => {
          const result = (await transport.send("Page.navigate", { url: params.url })) as { frameId: string };
          return {
            content: [{ type: "text", text: `Navigating to ${params.url}` }],
            details: { frameId: result?.frameId },
          };
        });
      },
    },

    query: {
      name: "cdp_query",
      label: "CDP Query",
      description: "Query DOM element and get its properties",
      parameters: Type.Object({
        selector: Type.String({ description: "CSS selector" }),
        property: Type.Optional(Type.String({ description: "Property to get (textContent, innerHTML, tagName)" })),
      }),
      async execute(_toolCallId: string, params: { selector: string; property?: string }) {
        return tryRunCdpTool("Query failed", async () => {
          // Embed values via JSON.stringify — safe against JS source breakout
          const selector = JSON.stringify(params.selector);
          const property = params.property ? JSON.stringify(params.property) : null;
          const script = `
            (() => {
              const el = document.querySelector(${selector});
              if (!el) return { found: false };
              return {
                found: true,
                tagName: el.tagName,
                textContent: el.textContent?.trim().substring(0, 500),
                innerHTML: el.innerHTML?.substring(0, 500),
                ${property ? `property: String(el[${property}])` : "property: undefined"}
              };
            })()
          `;
          const result = (await transport.send("Runtime.evaluate", { expression: script, returnByValue: true })) as {
            result: { value: unknown };
          };

          return {
            content: [{ type: "text", text: JSON.stringify(result?.result?.value, null, 2) }],
            details: result?.result?.value as Record<string, unknown>,
          };
        });
      },
    },

    eval: {
      name: "cdp_eval",
      label: "CDP Eval",
      description: "Execute JavaScript in the page context",
      parameters: Type.Object({
        script: Type.String({ description: "JavaScript code to execute" }),
      }),
      async execute(_toolCallId: string, params: { script: string }) {
        return tryRunCdpTool("Eval failed", async () => {
          const result = (await transport.send("Runtime.evaluate", {
            expression: params.script,
            returnByValue: true,
            awaitPromise: true,
          })) as {
            result?: { value: unknown; type: string };
            exceptionDetails?: { text?: string; exception?: { description?: string } };
          };
          const exception = result?.exceptionDetails;
          if (exception) {
            const msg = exception.exception?.description || exception.text || "Unknown script exception";
            return {
              content: [{ type: "text", text: `Script threw: ${msg}` }],
              details: { error: msg },
              isError: true,
            };
          }
          const value = result?.result?.value;
          const type = result?.result?.type;
          return {
            content: [
              { type: "text", text: typeof value === "object" ? JSON.stringify(value, null, 2) : String(value) },
            ],
            details: { value, type },
          };
        });
      },
    },

    console: {
      name: "cdp_console",
      label: "CDP Console",
      description: "Get browser console logs",
      parameters: Type.Object({
        clear: Type.Optional(Type.Boolean({ description: "Clear logs after reading" })),
      }),
      async execute(_toolCallId: string, params: { clear?: boolean }) {
        const logs = store.drain();
        if (params.clear) store.clear();
        return {
          content: [
            { type: "text", text: logs.length ? logs.map((l) => `[${l.type}] ${l.message}`).join("\n") : "(no logs)" },
          ],
          details: { logs },
        };
      },
    },

    screenshot: {
      name: "cdp_screenshot",
      label: "CDP Screenshot",
      description: "Capture a screenshot of the current page",
      parameters: Type.Object({
        path: Type.Optional(Type.String({ description: "Path to save screenshot (default: ./screenshot.png)" })),
        fullPage: Type.Optional(Type.Boolean({ description: "Capture full scrollable page" })),
      }),
      async execute(_toolCallId: string, params: { path?: string; fullPage?: boolean }) {
        return tryRunCdpTool("Screenshot failed", async () => {
          await transport.send("Page.enable");
          let result: { data: string };
          if (params.fullPage) {
            const metrics = (await transport.send("Page.getLayoutMetrics")) as {
              contentSize: { width: number; height: number };
            };
            const { width, height } = metrics.contentSize;
            result = (await transport.send("Page.captureScreenshot", {
              format: "png",
              captureBeyondViewport: true,
              clip: { x: 0, y: 0, width, height, scale: 1 },
            })) as { data: string };
          } else {
            result = (await transport.send("Page.captureScreenshot", { format: "png" })) as { data: string };
          }

          // Validate the write target before opening it.
          let requested: string;
          try {
            requested = validateScreenshotPath(params.path || "./screenshot.png", process.cwd(), pathFs);
          } catch (err) {
            if (err instanceof ScreenshotPathError) {
              return {
                content: [{ type: "text", text: err.message }],
                details: { error: err.code },
                isError: true,
              };
            }
            const msg = err instanceof Error ? err.message : String(err);
            return {
              content: [{ type: "text", text: `Screenshot path validation failed: ${msg}` }],
              details: { error: msg },
              isError: true,
            };
          }

          // O_NOFOLLOW so a symlink racing into place between the validation
          // above and this open cannot redirect the write either.
          let fd: number;
          try {
            fd = openSync(
              requested,
              fsConstants.O_CREAT | fsConstants.O_WRONLY | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW,
              0o644,
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return {
              content: [{ type: "text", text: `Cannot open screenshot path (symlink or invalid target): ${msg}` }],
              details: { error: msg },
              isError: true,
            };
          }
          try {
            writeFileSync(fd, Buffer.from(result.data, "base64"));
          } finally {
            closeSync(fd);
          }

          return {
            content: [{ type: "text", text: `Screenshot saved to ${requested}` }],
            details: { path: requested },
          };
        });
      },
    },

    back: {
      name: "cdp_back",
      label: "CDP Back",
      description: "Navigate back in browser history",
      parameters: Type.Object({}),
      async execute() {
        return tryRunCdpTool("Back failed", async () => {
          await transport.send("Runtime.evaluate", { expression: "history.back()" });
          return { content: [{ type: "text", text: "Navigating back" }], details: {} };
        });
      },
    },

    forward: {
      name: "cdp_forward",
      label: "CDP Forward",
      description: "Navigate forward in browser history",
      parameters: Type.Object({}),
      async execute() {
        return tryRunCdpTool("Forward failed", async () => {
          await transport.send("Runtime.evaluate", { expression: "history.forward()" });
          return { content: [{ type: "text", text: "Navigating forward" }], details: {} };
        });
      },
    },

    reload: {
      name: "cdp_reload",
      label: "CDP Reload",
      description: "Reload the current page",
      parameters: Type.Object({}),
      async execute() {
        return tryRunCdpTool("Reload failed", async () => {
          await transport.send("Page.reload");
          return { content: [{ type: "text", text: "Reloading page" }], details: {} };
        });
      },
    },

    viewport: {
      name: "cdp_viewport",
      label: "CDP Viewport",
      description:
        "Override the layout viewport with Emulation.setDeviceMetricsOverride (fixes 1x1 headless rendering for extraction and screenshots)",
      parameters: Type.Object({
        width: Type.Optional(Type.Number({ description: "Viewport width in CSS px (default: 1440)" })),
        height: Type.Optional(Type.Number({ description: "Viewport height in CSS px (default: 900)" })),
        deviceScaleFactor: Type.Optional(Type.Number({ description: "Device scale factor (default: 1)" })),
        mobile: Type.Optional(Type.Boolean({ description: "Emulate a mobile viewport (default: false)" })),
        reset: Type.Optional(
          Type.Boolean({ description: "Clear the override and return to the browser's real viewport" }),
        ),
      }),
      async execute(
        _toolCallId: string,
        params: { width?: number; height?: number; deviceScaleFactor?: number; mobile?: boolean; reset?: boolean },
      ) {
        return tryRunCdpTool("Viewport change failed", async () => {
          if (params.reset) {
            await transport.send("Emulation.clearDeviceMetricsOverride");
            return {
              content: [{ type: "text", text: "Viewport override cleared" }],
              details: { reset: true },
            };
          }

          const width = params.width ?? 1440;
          const height = params.height ?? 900;
          const deviceScaleFactor = params.deviceScaleFactor ?? 1;
          const mobile = params.mobile ?? false;

          if (!Number.isInteger(width) || width < 1 || width > 10000) {
            return {
              content: [{ type: "text", text: `Invalid width: ${width} (must be an integer 1-10000)` }],
              details: { error: "invalid width" },
              isError: true,
            };
          }
          if (!Number.isInteger(height) || height < 1 || height > 10000) {
            return {
              content: [{ type: "text", text: `Invalid height: ${height} (must be an integer 1-10000)` }],
              details: { error: "invalid height" },
              isError: true,
            };
          }
          if (!Number.isFinite(deviceScaleFactor) || deviceScaleFactor <= 0 || deviceScaleFactor > 5) {
            return {
              content: [
                { type: "text", text: `Invalid deviceScaleFactor: ${deviceScaleFactor} (must be > 0 and <= 5)` },
              ],
              details: { error: "invalid deviceScaleFactor" },
              isError: true,
            };
          }

          await transport.send("Emulation.setDeviceMetricsOverride", {
            width,
            height,
            deviceScaleFactor,
            mobile,
          });

          return {
            content: [
              {
                type: "text",
                text: `Viewport set to ${width}x${height} (deviceScaleFactor ${deviceScaleFactor}, ${mobile ? "mobile" : "desktop"})`,
              },
            ],
            details: { width, height, deviceScaleFactor, mobile },
          };
        });
      },
    },
  } satisfies Record<string, ToolDefinition>;

  return cdpTools;
}
