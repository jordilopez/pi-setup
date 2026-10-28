/**
 * Production adapter: sends warnings to `console.warn` (or any injected writer).
 */

import type { WarnSink } from "../../ports/warn-sink.ts";

export function ConsoleWarnSink(write: (message: string) => void = console.warn): WarnSink {
  return { warn: (message) => write(message) };
}
