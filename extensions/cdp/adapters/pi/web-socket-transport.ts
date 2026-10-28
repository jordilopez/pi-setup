/**
 * Production adapter: CDP over the Chrome remote-debugging WebSocket endpoint.
 *
 * Owns the WebSocket/fetch plumbing and the socket-generation counter that
 * stops a stale socket's handlers from corrupting a newer connection. Request
 * ids, timeouts, and disconnect-invalidation live in the domain `RequestTracker`.
 */

import { RequestTracker } from "../../domain/request-tracker.ts";
import type { CdpTransport, ConsoleApiParams } from "../../ports/transport.ts";

const CDP_HOST = "localhost";
const CDP_TIMEOUT_MS = 30_000;

interface CdpResponse {
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

interface CdpEvent {
  method: string;
  params: Record<string, unknown>;
}

export class WebSocketCdpTransport implements CdpTransport {
  private socket: WebSocket | null = null;
  private generation = 0;
  private readonly tracker = new RequestTracker();
  private readonly consoleHandlers = new Set<(params: ConsoleApiParams) => void>();
  private readonly connectHandlers = new Set<() => void>();

  isConnected(): boolean {
    return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
  }

  onConsoleEvent(handler: (params: ConsoleApiParams) => void): () => void {
    this.consoleHandlers.add(handler);
    return () => this.consoleHandlers.delete(handler);
  }

  onConnect(handler: () => void): () => void {
    this.connectHandlers.add(handler);
    return () => this.connectHandlers.delete(handler);
  }

  async connect(port: number): Promise<void> {
    // Close any existing connection cleanly and bump the generation so the old
    // socket's onclose can never null out or reject state belonging to a new
    // connection (fixes socket leaks / corruption on reconnects).
    const oldSocket = this.socket;
    if (oldSocket && oldSocket.readyState === WebSocket.OPEN) {
      oldSocket.close();
    }
    const generation = ++this.generation;
    this.socket = null;
    // Anything still pending was sent over the old socket, which is being
    // replaced — nothing will ever answer it.
    this.tracker.bump();

    // Get the websocket debugger URL from the JSON endpoint.
    const response = await fetch(`http://${CDP_HOST}:${port}/json`);
    if (!response.ok) {
      throw new Error(
        `Failed to connect to Chrome on port ${port}. Is Chrome running with --remote-debugging-port=${port}?`,
      );
    }

    const tabs = (await response.json()) as Array<{
      id: string;
      webSocketDebuggerUrl: string;
      title?: string;
      url?: string;
    }>;
    if (tabs.length === 0) {
      throw new Error("No Chrome tabs found. Open a page in Chrome first.");
    }

    const wsUrl = tabs[0].webSocketDebuggerUrl;

    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let settled = false;
      const isCurrent = () => generation === this.generation;

      ws.onopen = () => {
        if (!isCurrent()) {
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
        this.socket = ws;
        for (const handler of this.connectHandlers) handler();
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
        let data: CdpResponse | CdpEvent;
        try {
          data = JSON.parse(event.data as string) as CdpResponse | CdpEvent;
        } catch {
          // Malformed or unexpected WebSocket payload — ignore.
          return;
        }

        if ("id" in data) {
          if (data.error) {
            this.tracker.rejectWithCdpError(data.id, data.error.message);
          } else {
            this.tracker.resolve(data.id, data.result);
          }
        }

        if ("method" in data && data.method === "Runtime.consoleAPICalled") {
          for (const handler of this.consoleHandlers) handler(data.params as unknown as ConsoleApiParams);
        }
      };

      ws.onclose = () => {
        if (!isCurrent()) {
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
        this.tracker.bump();
        if (this.socket === ws) this.socket = null;
      };
    });

    // Enable required domains.
    await this.send("Runtime.enable");
    await this.send("Log.enable");
    await this.send("Page.enable");
  }

  async send(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to browser. Use /cdp:connect first.");
    }

    const { id, promise } = this.tracker.allocate(method, CDP_TIMEOUT_MS);
    this.socket.send(JSON.stringify({ id, method, params }));
    return promise;
  }

  close(): void {
    // Bump the generation so an in-flight connect becomes stale: its handlers
    // now reject instead of establishing itself after an explicit disconnect.
    this.generation++;
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.tracker.bump();
  }
}
