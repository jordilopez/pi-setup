/**
 * CDP Extension
 *
 * Chrome DevTools Protocol browser automation (namespace `cdp`):
 * - tools: `cdp_connect`, `cdp_goto`, `cdp_query`, `cdp_eval`, `cdp_screenshot`, …
 * - commands: `/cdp:connect`, `/cdp:disconnect`, `/cdp:console`
 *
 * No puppeteer needed - uses CDP's WebSocket API directly.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

// CDP Message types
interface CdpMessage {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface CdpResponse {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

// Connection state
let cdpSocket: WebSocket | null = null;
let cdpPort = 9222;
let cdpHost = "localhost";
let messageId = 0;
let cdpGeneration = 0;

interface PendingRequest {
  method: string;
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

let pendingRequests = new Map<number, PendingRequest>();

// Bounds to keep memory predictable on noisy pages
const MAX_CONSOLE_LOGS = 2000;
const MAX_CONSOLE_MSG_CHARS = 2000;
let consoleLogs: Array<{ type: string; message: string; timestamp: number }> = [];

// Parse CLI args for --port
function parseArgs(): void {
  const args = process.argv.slice(2);
  const portIndex = args.indexOf("--port");
  if (portIndex !== -1 && args[portIndex + 1]) {
    cdpPort = parseInt(args[portIndex + 1], 10);
  }
}

// CDP over WebSocket
async function sendCdp(method: string, params?: Record<string, unknown>): Promise<unknown> {
  if (!cdpSocket || cdpSocket.readyState !== WebSocket.OPEN) {
    throw new Error("Not connected to browser. Use /cdp:connect first.");
  }

  return new Promise((resolve, reject) => {
    const id = ++messageId;
    const message: CdpMessage = { id, method, params };

    const timeout = setTimeout(() => {
      pendingRequests.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 30000);

    pendingRequests.set(id, {
      method,
      resolve: (result) => {
        clearTimeout(timeout);
        resolve(result);
      },
      reject: (err) => {
        clearTimeout(timeout);
        reject(err);
      },
    });

    cdpSocket!.send(JSON.stringify(message));
  });
}

// Connect to Chrome via WebSocket
async function connectToBrowser(): Promise<void> {
  // Close any existing connection cleanly and bump the generation so the old
  // socket's onclose can never null out or reject state belonging to a new
  // connection (fixes socket leaks / corruption on reconnects).
  const oldSocket = cdpSocket;
  if (oldSocket && oldSocket.readyState === WebSocket.OPEN) {
    oldSocket.close();
  }
  const generation = ++cdpGeneration;
  cdpSocket = null;
  // Anything still pending was sent over the old socket, which is being
  // replaced — nothing will ever answer it. Reject now instead of letting
  // stale requests linger in the map until their 30s timeout.
  rejectPendingRequests();

  // First, get websocket debugger URL from JSON endpoint
  const response = await fetch(`http://${cdpHost}:${cdpPort}/json`);
  if (!response.ok) {
    throw new Error(`Failed to connect to Chrome on port ${cdpPort}. Is Chrome running with --remote-debugging-port=${cdpPort}?`);
  }

  const tabs = await response.json() as Array<{ id: string; webSocketDebuggerUrl: string; title?: string; url?: string }>;
  if (tabs.length === 0) {
    throw new Error("No Chrome tabs found. Open a page in Chrome first.");
  }

  // Connect to the first available tab
  const target = tabs[0];
  const wsUrl = target.webSocketDebuggerUrl;

  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let settled = false;
    const isCurrent = () => generation === cdpGeneration;

    ws.onopen = () => {
      if (!isCurrent()) {
        // Superseded by a newer connect or an explicit disconnect: close the
        // stale socket AND settle the promise — otherwise the awaiting
        // connectToBrowser() would hang forever waiting for a socket that
        // was deliberately abandoned.
        if (!settled) {
          settled = true;
          reject(new Error("Connection superseded by a newer connect or disconnect"));
        }
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        return;
      }
      cdpSocket = ws;
      consoleLogs = [];
      settled = true;
      resolve();
    };

    ws.onerror = (err) => {
      if (!isCurrent()) {
        if (!settled) {
          settled = true;
          reject(new Error("Connection superseded by a newer connect or disconnect"));
        }
        return;
      }
      if (!settled) {
        settled = true;
        reject(new Error(`WebSocket error: ${err}`));
      }
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    };

    ws.onmessage = (event) => {
      if (!isCurrent()) return;
      let data: CdpResponse | { method: string; params: Record<string, unknown> };
      try {
        data = JSON.parse(event.data as string) as CdpResponse | { method: string; params: Record<string, unknown> };
      } catch {
        // Malformed or unexpected WebSocket payload — ignore, don't destabilize the extension
        return;
      }

      // Handle responses
      if ("id" in data) {
        const pending = pendingRequests.get(data.id);
        if (pending) {
          pendingRequests.delete(data.id);
          if (data.error) {
            pending.reject(new Error(`${pending.method}: ${data.error.message}`));
          } else {
            pending.resolve(data.result);
          }
        }
      }

      // Handle events (console messages)
      if ("method" in data && data.method === "Runtime.consoleAPICalled") {
        const params = data.params as { type: string; args: Array<{ value: string }> };
        const message = params.args.map((a) => String(a.value)).join(" ").slice(0, MAX_CONSOLE_MSG_CHARS);
        consoleLogs.push({ type: params.type, message, timestamp: Date.now() });
        if (consoleLogs.length > MAX_CONSOLE_LOGS) {
          consoleLogs.splice(0, consoleLogs.length - MAX_CONSOLE_LOGS);
        }
      }
    };

    ws.onclose = () => {
      if (!isCurrent()) {
        // Stale socket — the new connection (or disconnect) owns state. Only
        // settle if the open/error handlers never got the chance.
        if (!settled) {
          settled = true;
          reject(new Error("CDP connection closed before opening"));
        }
        return;
      }
      if (!settled) {
        settled = true;
        reject(new Error("CDP connection closed before opening"));
      }
      rejectPendingRequests();
      if (cdpSocket === ws) cdpSocket = null;
    };
  });

  // Enable required domains
  await sendCdp("Runtime.enable");
  await sendCdp("Log.enable");
  await sendCdp("Page.enable");
}

/** Reject all pending CDP requests (used on close and explicit disconnect). */
function rejectPendingRequests(): void {
  for (const [id, pending] of pendingRequests) {
    pendingRequests.delete(id);
    pending.reject(new Error("CDP connection closed"));
  }
}

function disconnect(): void {
  // Bump the generation so an in-flight connect (still awaiting the /json
  // fetch or opening its socket) becomes stale: its onopen/onerror/onclose
  // now reject instead of establishing itself after an explicit disconnect.
  cdpGeneration++;
  if (cdpSocket) {
    cdpSocket.close();
    cdpSocket = null;
  }
  rejectPendingRequests();
  consoleLogs = [];
}

// CDP commands as tools
const cdpTools = {
  connect: {
    name: "cdp_connect",
    label: "CDP Connect",
    description: "Connect to Chrome browser via DevTools Protocol",
    parameters: Type.Object({
      port: Type.Optional(Type.Number({ description: "Chrome remote debugging port (default: 9222)" })),
    }),
    async execute(_toolCallId: string, params: { port?: number }) {
      try {
        if (params.port !== undefined) {
          if (!Number.isInteger(params.port) || params.port < 1 || params.port > 65535) {
            return {
              content: [{ type: "text", text: `Invalid port: ${params.port} (must be 1-65535)` }],
              details: { error: "invalid port" },
              isError: true,
            };
          }
          cdpPort = params.port;
        }
        // cdpPort is seeded from CLI --port at load time (parseArgs in the
        // entry point) — an explicit tool parameter must not be clobbered.
        await connectToBrowser();
        return {
          content: [{ type: "text", text: `Connected to Chrome on port ${cdpPort}` }],
          details: { connected: true, port: cdpPort },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Connection failed: ${msg}` }],
          details: { error: msg },
          isError: true,
        };
      }
    },
  },

  disconnect: {
    name: "cdp_disconnect",
    label: "CDP Disconnect",
    description: "Disconnect from Chrome browser",
    parameters: Type.Object({}),
    async execute() {
      disconnect();
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
      try {
        const result = await sendCdp("Page.navigate", { url: params.url }) as { frameId: string };
        return {
          content: [{ type: "text", text: `Navigating to ${params.url}` }],
          details: { frameId: result?.frameId },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Navigation failed: ${msg}` }],
          details: { error: msg },
          isError: true,
        };
      }
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
      try {
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
        const result = await sendCdp("Runtime.evaluate", { expression: script, returnByValue: true }) as { result: { value: unknown } };
        return {
          content: [{ type: "text", text: JSON.stringify(result?.result?.value, null, 2) }],
          details: result?.result?.value as Record<string, unknown>,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Query failed: ${msg}` }],
          details: { error: msg },
          isError: true,
        };
      }
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
      try {
        const result = await sendCdp("Runtime.evaluate", {
          expression: params.script,
          returnByValue: true,
          // Await promise-returning expressions so `await fetch(...)` etc.
          // are reported with their resolved value, not a pending promise.
          awaitPromise: true,
        }) as {
          result?: { value: unknown; type: string };
          exceptionDetails?: { text?: string; exception?: { description?: string } };
        };
        // A thrown JS error surfaces in exceptionDetails, not in result —
        // report it as a tool error instead of a misleading `undefined`.
        const exception = result?.exceptionDetails;
        if (exception) {
          const msg =
            exception.exception?.description ||
            exception.text ||
            "Unknown script exception";
          return {
            content: [{ type: "text", text: `Script threw: ${msg}` }],
            details: { error: msg },
            isError: true,
          };
        }
        const value = result?.result?.value;
        const type = result?.result?.type;
        return {
          content: [{ type: "text", text: typeof value === "object" ? JSON.stringify(value, null, 2) : String(value) }],
          details: { value, type },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Eval failed: ${msg}` }],
          details: { error: msg },
          isError: true,
        };
      }
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
      const logs = [...consoleLogs];
      if (params.clear) consoleLogs = [];
      return {
        content: [{ type: "text", text: logs.length ? logs.map((l) => `[${l.type}] ${l.message}`).join("\n") : "(no logs)" }],
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
      try {
        await sendCdp("Page.enable");
        let result: { data: string };
        if (params.fullPage) {
          // Full-page capture: use the layout metrics + captureBeyondViewport
          const metrics = await sendCdp("Page.getLayoutMetrics") as {
            contentSize: { width: number; height: number };
          };
          const { width, height } = metrics.contentSize;
          result = await sendCdp("Page.captureScreenshot", {
            format: "png",
            captureBeyondViewport: true,
            clip: { x: 0, y: 0, width, height, scale: 1 },
          }) as { data: string };
        } else {
          result = await sendCdp("Page.captureScreenshot", { format: "png" }) as { data: string };
        }
        // Restrict writes to inside the current working directory so a
        // model-supplied path can never overwrite arbitrary files on disk.
        const { resolve, dirname, sep } = await import("node:path");
        const fs = await import("node:fs");
        const cwd = process.cwd();
        const requested = resolve(cwd, params.path || "./screenshot.png");
        if (requested !== cwd && !requested.startsWith(cwd + sep)) {
          return {
            content: [{ type: "text", text: `Screenshot path must be inside the project: ${requested}` }],
            details: { error: "path outside project" },
            isError: true,
          };
        }

        // The lexical check above is not enough: a path like
        // `project/link/out.png` passes it even when `link` is a symlink
        // pointing outside the repo. Resolve the real parent directory and
        // verify IT is still inside the project.
        const parentDir = dirname(requested);
        let realParent: string;
        try {
          realParent = fs.realpathSync(parentDir);
        } catch {
          return {
            content: [{ type: "text", text: `Screenshot parent directory does not exist: ${parentDir}` }],
            details: { error: "parent directory missing" },
            isError: true,
          };
        }
        if (realParent !== cwd && !realParent.startsWith(cwd + sep)) {
          return {
            content: [{ type: "text", text: `Screenshot parent directory resolves outside the project: ${realParent}` }],
            details: { error: "parent resolves outside project" },
            isError: true,
          };
        }

        // Reject a symlink at the final path component with a clear message,
        // and open with O_NOFOLLOW so a symlink racing into place between the
        // lstat check and the open cannot redirect the write either.
        try {
          if (fs.lstatSync(requested).isSymbolicLink()) {
            return {
              content: [{ type: "text", text: `Screenshot path is a symlink — refusing to follow: ${requested}` }],
              details: { error: "path is a symlink" },
              isError: true,
            };
          }
        } catch {
          // lstat throws only when nothing exists at the target — fine, the
          // O_NOFOLLOW open will create it below.
        }

        let fd: number;
        try {
          fd = fs.openSync(
            requested,
            fs.constants.O_CREAT | fs.constants.O_WRONLY | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW,
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
          fs.writeFileSync(fd, Buffer.from(result.data, "base64"));
        } finally {
          fs.closeSync(fd);
        }

        return {
          content: [{ type: "text", text: `Screenshot saved to ${requested}` }],
          details: { path: requested },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Screenshot failed: ${msg}` }],
          details: { error: msg },
          isError: true,
        };
      }
    },
  },

  back: {
    name: "cdp_back",
    label: "CDP Back",
    description: "Navigate back in browser history",
    parameters: Type.Object({}),
    async execute() {
      try {
        await sendCdp("Runtime.evaluate", { expression: "history.back()" });
        return { content: [{ type: "text", text: "Navigating back" }], details: {} };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Back failed: ${msg}` }],
          details: { error: msg },
          isError: true,
        };
      }
    },
  },

  forward: {
    name: "cdp_forward",
    label: "CDP Forward",
    description: "Navigate forward in browser history",
    parameters: Type.Object({}),
    async execute() {
      try {
        await sendCdp("Runtime.evaluate", { expression: "history.forward()" });
        return { content: [{ type: "text", text: "Navigating forward" }], details: {} };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Forward failed: ${msg}` }],
          details: { error: msg },
          isError: true,
        };
      }
    },
  },

  reload: {
    name: "cdp_reload",
    label: "CDP Reload",
    description: "Reload the current page",
    parameters: Type.Object({}),
    async execute() {
      try {
        await sendCdp("Page.reload");
        return { content: [{ type: "text", text: "Reloading page" }], details: {} };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: `Reload failed: ${msg}` }],
          details: { error: msg },
          isError: true,
        };
      }
    },
  },
};

// Extension entry point
export default function (pi: ExtensionAPI) {
  // Parse --port from CLI args
  parseArgs();

  // Register tools
  for (const tool of Object.values(cdpTools)) {
    pi.registerTool(tool);
  }

  // Register commands for quick access
  pi.registerCommand("cdp:connect", {
    description: "Connect to Chrome browser via CDP",
    handler: async (args) => {
      const port = args ? parseInt(args, 10) : cdpPort;
      const tool = cdpTools.connect;
      return tool.execute("cmd", { port });
    },
  });

  pi.registerCommand("cdp:disconnect", {
    description: "Disconnect from Chrome browser",
    handler: async () => {
      disconnect();
      return;
    },
  });

  pi.registerCommand("cdp:console", {
    description: "Get browser console logs",
    handler: async () => {
      const result = cdpTools.console.execute("cmd", {});
      return result;
    },
  });

  // Status on load
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify(`Browser DevTools ready. Use /cdp:connect to connect to Chrome.`, "info");
  });

  // Cleanup on shutdown
  pi.on("session_shutdown", () => {
    disconnect();
  });
}
