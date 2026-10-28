/**
 * Pending-request lifecycle for the CDP transport.
 *
 * Owns the testable core that used to be welded to the WebSocket: message-id
 * allocation, the per-request timeout, and "reject everything" invalidation on
 * disconnect. Ids are monotonically increasing and never reused, so a message
 * from a stale socket — which `bump()` has already evicted from the pending
 * map — resolves into nothing and is ignored.
 */

interface PendingEntry {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class RequestTracker {
  private nextId = 0;
  private pending = new Map<number, PendingEntry>();

  /**
   * Invalidate every in-flight request, as happens on disconnect or when a
   * connection is replaced. Must be called whenever the owning transport drops
   * or supersedes its socket.
   */
  bump(): void {
    const reason = new Error("CDP connection closed");
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timeout);
      this.pending.delete(id);
      entry.reject(reason);
    }
  }

  /**
   * Register a request for `method`, scheduling a timeout that rejects it with
   * "CDP timeout" if no response arrives in `timeoutMs`.
   */
  allocate<T = unknown>(method: string, timeoutMs: number): { id: number; promise: Promise<T> } {
    const id = ++this.nextId;
    const promise = new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        method,
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timeout,
      });
    });
    return { id, promise };
  }

  /** Resolve a pending request by id. No-op if it no longer exists. */
  resolve(id: number, result: unknown): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    entry.resolve(result);
  }

  /** Reject a pending request with a CDP error, prefixed by its method name. */
  rejectWithCdpError(id: number, message: string): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    this.pending.delete(id);
    entry.reject(new Error(`${entry.method}: ${message}`));
  }

  get pendingCount(): number {
    return this.pending.size;
  }
}
