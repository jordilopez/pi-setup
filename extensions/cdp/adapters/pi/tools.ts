/**
 * The `cdp_*` tool definitions, driven entirely through the ports/domain:
 * `transport` for the browser, `store` for console logs, `pathFs` with the
 * write-path guard for screenshot/report locations, and `lighthouse` for audits.
 */

import { closeSync, constants as fsConstants, mkdirSync, openSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import type { ConsoleStore } from "../../domain/console-store.ts";
import {
  defaultReportBasename,
  formatSummaryText,
  LighthouseParamsError,
  type LighthouseParams,
  type LighthouseParamsInput,
  normalizeLighthouseParams,
  summarizeLhr,
} from "../../domain/lighthouse-report.ts";
import { validateScreenshotPath, validateWritePath, WritePathError } from "../../domain/path-guard.ts";
import type { PathFs } from "../../ports/fs.ts";
import type { LighthouseRunner } from "../../ports/lighthouse.ts";
import type { CdpTransport } from "../../ports/transport.ts";

interface CdpToolsDeps {
  transport: CdpTransport;
  store: ConsoleStore;
  pathFs: PathFs;
  initialPort: number;
  lighthouse: LighthouseRunner;
}

/** Default directory for Lighthouse reports, relative to the project root. */
const REPORT_DIR = ".lighthouse";

/** `cdp_lighthouse` parameters: the domain's input shape plus report-location options. */
interface LighthouseToolParams extends LighthouseParamsInput {
  path?: string;
  includeHtml?: boolean;
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
 * in-page exceptions, the screenshot and Lighthouse path guards) keep their
 * bespoke handling and use this only for the outermost transport failures.
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

/**
 * Map a coded domain error (path guard, Lighthouse parameter validation) to the
 * shared tool-failure shape. Returns `undefined` for errors without a code, so
 * each caller keeps its bespoke fallback message for those.
 */
function codedToolFailure(err: unknown): ToolFailure | undefined {
  if (err instanceof WritePathError || err instanceof LighthouseParamsError) {
    return {
      content: [{ type: "text", text: err.message }],
      details: { error: err.code },
      isError: true,
    };
  }
  return undefined;
}

/**
 * Validate a write target, creating its parent directory first when that is the
 * only thing missing. Directory creation happens *after* the lexical
 * inside-the-project check (the first guard to run), so a rejected path can
 * never create directories outside the project.
 */
function ensureWritePath(requested: string, pathFs: PathFs, subject: string): string {
  const cwd = process.cwd();
  try {
    return validateWritePath(requested, cwd, pathFs, subject);
  } catch (error) {
    if (error instanceof WritePathError && error.code === "parent directory missing") {
      mkdirSync(dirname(resolve(cwd, requested)), { recursive: true });
      return validateWritePath(requested, cwd, pathFs, subject);
    }
    throw error;
  }
}

/** Write a report, refusing to follow a symlink that raced into place. */
function writeFileNoFollow(target: string, data: Buffer): void {
  const fd = openSync(
    target,
    fsConstants.O_CREAT | fsConstants.O_WRONLY | fsConstants.O_TRUNC | fsConstants.O_NOFOLLOW,
    0o644,
  );
  try {
    writeFileSync(fd, data);
  } finally {
    closeSync(fd);
  }
}

/** `.lighthouse/x.report.json` -> `.lighthouse/x.report.html` */
function htmlTargetFor(jsonTarget: string): string {
  return /\.json$/u.test(jsonTarget) ? jsonTarget.replace(/\.json$/u, ".html") : `${jsonTarget}.html`;
}

// `satisfies` keeps each tool's precise parameter/execute types while giving
// the content literals the contextual ToolDefinition typing (so `type: "text"`
// stays a literal instead of widening to `string`).
export function createCdpTools(deps: CdpToolsDeps) {
  const { transport, store, pathFs, lighthouse } = deps;
  let currentPort = deps.initialPort;

  /** Read the URL of the page the transport is attached to. */
  async function currentPageUrl(): Promise<string> {
    const result = (await transport.send("Runtime.evaluate", {
      expression: "location.href",
      returnByValue: true,
    })) as { result?: { value?: unknown } };
    const href = result?.result?.value;
    if (typeof href !== "string" || href.length === 0) {
      throw new Error("Could not read the current page URL; pass `url` explicitly.");
    }
    return href;
  }

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
            const failure = codedToolFailure(err);
            if (failure) return failure;
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

    lighthouse: {
      name: "cdp_lighthouse",
      label: "CDP Lighthouse",
      description:
        "Run a Lighthouse audit on the connected Chrome (no second browser) and write the JSON report to disk. " +
        "Returns the report path plus a compact summary; read the file for full audits and opportunities.",
      parameters: Type.Object({
        url: Type.Optional(Type.String({ description: "URL to audit (default: the current page). Must be http(s)." })),
        device: Type.Optional(
          Type.Union([Type.Literal("mobile"), Type.Literal("desktop")], {
            description: "Lighthouse form factor (default: mobile)",
          }),
        ),
        categories: Type.Optional(
          Type.Array(Type.String(), {
            description: "Categories to run: performance, accessibility, best-practices, seo (default: all)",
          }),
        ),
        path: Type.Optional(
          Type.String({
            description:
              "Report path, relative to the project (default: .lighthouse/<timestamp>-<slug>-<device>.report.json)",
          }),
        ),
        includeHtml: Type.Optional(Type.Boolean({ description: "Also write the rendered HTML report (.html)" })),
        throttling: Type.Optional(
          Type.Union([Type.Literal("simulate"), Type.Literal("devtools"), Type.Literal("none")], {
            description: "Throttling method (default: simulate)",
          }),
        ),
        maxWaitForLoadMs: Type.Optional(
          Type.Number({ description: "Page-load wait before Lighthouse gives up (5000-120000, default: 45000)" }),
        ),
      }),
      async execute(_toolCallId: string, params: LighthouseToolParams) {
        if (!transport.isConnected()) {
          return {
            content: [{ type: "text", text: "Not connected to Chrome. Run cdp_connect first." }],
            details: { error: "not connected" },
            isError: true,
          };
        }

        return tryRunCdpTool("Lighthouse run failed", async () => {
          const url = params.url?.trim() ? params.url : await currentPageUrl();

          let normalized: LighthouseParams;
          try {
            normalized = normalizeLighthouseParams({ ...params, url });
          } catch (err) {
            const failure = codedToolFailure(err);
            if (failure) return failure;
            throw err;
          }

          const basename = defaultReportBasename(normalized.url, normalized.formFactor, new Date());
          const requestedJson = params.path?.trim() || `${REPORT_DIR}/${basename}.report.json`;

          let jsonPath: string;
          let htmlPath: string | undefined;
          try {
            jsonPath = ensureWritePath(requestedJson, pathFs, "Report");
            if (params.includeHtml) htmlPath = ensureWritePath(htmlTargetFor(requestedJson), pathFs, "Report");
          } catch (err) {
            const failure = codedToolFailure(err);
            if (failure) return failure;
            const msg = err instanceof Error ? err.message : String(err);
            return {
              content: [{ type: "text", text: `Report path validation failed: ${msg}` }],
              details: { error: msg },
              isError: true as const,
            };
          }

          const report = await lighthouse.run({
            params: normalized,
            port: currentPort,
            includeHtml: params.includeHtml ?? false,
          });

          writeFileNoFollow(jsonPath, Buffer.from(report.reportJson, "utf8"));
          if (htmlPath !== undefined && report.reportHtml !== undefined) {
            writeFileNoFollow(htmlPath, Buffer.from(report.reportHtml, "utf8"));
          }

          const summary = summarizeLhr(report.lhr);
          const text = formatSummaryText(summary, jsonPath, normalized.formFactor);
          return {
            content: [
              {
                type: "text",
                text: htmlPath ? `${text}\nHTML report written to ${htmlPath}` : text,
              },
            ],
            details: {
              path: jsonPath,
              htmlPath,
              url: normalized.url,
              formFactor: normalized.formFactor,
              ...summary,
            },
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
