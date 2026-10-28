/**
 * Bounded ring buffer for browser console messages.
 *
 * Stateful but I/O-free: the bounds policy (drop oldest beyond `maxEntries`)
 * and read/clear semantics belong to the domain; the transport feeds it via the
 * `onConsoleEvent` subscription in the adapter.
 */

import type { ConsoleMessageInput } from "./console-format.ts";

/** Maximum retained console entries. */
export const MAX_CONSOLE_LOGS = 2000;

export interface ConsoleEntry {
  type: string;
  message: string;
  timestamp: number;
}

export interface ConsoleStore {
  push(entry: ConsoleMessageInput): void;
  /** Return a copy of the retained entries without clearing. */
  drain(): ConsoleEntry[];
  clear(): void;
  readonly size: number;
}

export function createConsoleStore(maxEntries: number = MAX_CONSOLE_LOGS, now: () => number = Date.now): ConsoleStore {
  let entries: ConsoleEntry[] = [];

  return {
    push(entry) {
      entries.push({ ...entry, timestamp: now() });
      if (entries.length > maxEntries) {
        entries.splice(0, entries.length - maxEntries);
      }
    },
    drain() {
      return [...entries];
    },
    clear() {
      entries = [];
    },
    get size() {
      return entries.length;
    },
  };
}
