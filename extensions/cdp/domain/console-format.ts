/**
 * Pure formatting for CDP console events.
 */

import type { ConsoleApiParams } from "../ports/transport.ts";

/** Truncation bound for a single console message (matches the old code). */
export const MAX_CONSOLE_MSG_CHARS = 2000;

/** A formatted console message, ready to store (timestamp added by the store). */
export interface ConsoleMessageInput {
  type: string;
  message: string;
}

/**
 * Turn a `Runtime.consoleAPICalled` payload into a storeable message: join the
 * argument values with spaces and truncate to `MAX_CONSOLE_MSG_CHARS`.
 */
export function formatConsoleApiCall(params: ConsoleApiParams): ConsoleMessageInput {
  const message = params.args
    .map((arg) => String(arg.value))
    .join(" ")
    .slice(0, MAX_CONSOLE_MSG_CHARS);
  return { type: params.type, message };
}
