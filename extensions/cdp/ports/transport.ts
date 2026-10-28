/**
 * Outbound port: Chrome DevTools Protocol transport.
 *
 * The domain/tool layer asks "connect to the browser, send a CDP command, get
 * the result, watch console events" without caring whether that runs over the
 * WebSocket debugger endpoint, a test fake, or something else. The concrete
 * implementation lives in `adapters/pi/web-socket-transport.ts`.
 */

/** Raw `Runtime.consoleAPICalled` event payload emitted by the transport. */
export interface ConsoleApiParams {
  type: string;
  args: Array<{ value: string }>;
}

export interface CdpTransport {
  /** Connect to Chrome's debugger endpoint on the given port. */
  connect(port: number): Promise<void>;
  /** Send a CDP command and resolve with its `result`. */
  send(method: string, params?: Record<string, unknown>): Promise<unknown>;
  /** Close the connection (and clear console state on the next connect). */
  close(): void;
  /** Whether a connection is currently open. */
  isConnected(): boolean;
  /** Subscribe to `Runtime.consoleAPICalled` events. Returns an unsubscribe fn. */
  onConsoleEvent(handler: (params: ConsoleApiParams) => void): () => void;
  /** Subscribe to successful-connect events. Returns an unsubscribe fn. */
  onConnect(handler: () => void): () => void;
}
