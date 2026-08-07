/**
 * Shared CDP connection state and helpers.
 *
 * Owns the single active connection; tool modules use getConnection()
 * to read it and cdpSend()/findTarget()/attachToTarget() to talk to it.
 */

import WebSocket from "ws";

export interface CDPConnection {
  ws: WebSocket;
  pending: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
  msgId: number;
}

let connection: CDPConnection | null = null;

export function getConnection(): CDPConnection | null {
  return connection;
}

export function connectCDP(wsUrl: string): Promise<CDPConnection> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
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
      } catch {
        // ignore parse errors
      }
    });

    ws.on("error", reject);
    ws.on("close", () => {
      connection = null;
    });
  });
}

export function disconnectCDP(): boolean {
  if (connection) {
    connection.ws.close();
    connection = null;
    return true;
  }
  return false;
}

export function cdpSend(conn: CDPConnection, method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    conn.msgId++;
    const id = conn.msgId;
    conn.pending.set(id, { resolve, reject });
    conn.ws.send(JSON.stringify({ id, method, params }));
  });
}

export async function findTarget(conn: CDPConnection, urlFilter: string): Promise<string | null> {
  const targets = (await cdpSend(conn, "Target.getTargets")) as {
    targetInfos: Array<{ targetId: string; url: string }>;
  };
  const target = targets.targetInfos.find((t) => t.url.includes(urlFilter));
  return target?.targetId ?? null;
}

export async function attachToTarget(conn: CDPConnection, targetId: string): Promise<string> {
  const result = (await cdpSend(conn, "Target.attachToTarget", {
    targetId,
    flatten: true,
  })) as { sessionId: string };
  return result.sessionId;
}
