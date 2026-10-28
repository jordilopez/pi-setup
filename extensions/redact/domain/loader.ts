/**
 * Redaction pattern loader: mtime-invalidation cache + last-known-good policy.
 *
 * The domain owns the *policy* — cache invalidation by mtime, keep the
 * last-known-good pattern set when the config is broken, warn once per change —
 * without touching the filesystem. The bytes come in through `ConfigSource`
 * and warnings leave through `WarnSink`.
 */

import type { ConfigSource } from "../ports/config-source.ts";
import type { WarnSink } from "../ports/warn-sink.ts";
import { compilePatterns, type Pattern } from "./patterns.ts";

interface Cache {
  mtimeMs: number;
  patterns: Pattern[];
}

/**
 * Returns a loader that reads the config on every call (a cheap `stat`-shaped
 * check via `ConfigSource`), recompiles only when the mtime changes, and never
 * falls back to zero patterns when a previously-good config breaks.
 */
export function createPatternLoader(source: ConfigSource, warnSink: WarnSink, configLabel: string): () => Pattern[] {
  let cache: Cache | null = null;
  // Remember the mtime we last warned about so a persistently broken config
  // logs once per change instead of spamming every read.
  let lastWarnedMtimeMs = -1;

  /** Handle a broken/unreadable config at `mtimeMs`: keep cache or give up, warn once. */
  const broken = (mtimeMs: number): Pattern[] => {
    if (cache) {
      if (lastWarnedMtimeMs !== mtimeMs) {
        lastWarnedMtimeMs = mtimeMs;
        warnSink.warn(`redact: could not parse ${configLabel}; keeping the last-known-good patterns`);
      }
      return cache.patterns;
    }
    // No cache yet — the config was never valid. Redact nothing rather than
    // throw on every read (the tool_result handler has no error surface), but
    // warn loudly once so the broken config is not silently disabling redaction.
    if (lastWarnedMtimeMs !== mtimeMs) {
      lastWarnedMtimeMs = mtimeMs;
      warnSink.warn(`redact: ${configLabel} is unreadable or invalid — no patterns loaded`);
    }
    return [];
  };

  return () => {
    const read = source.read();

    if (read.status === "missing") {
      // No config file — fast no-op path.
      cache = null;
      return [];
    }

    if (read.status === "unreadable") {
      return broken(read.mtimeMs);
    }

    if (cache && cache.mtimeMs === read.mtimeMs) {
      return cache.patterns;
    }

    try {
      const config = JSON.parse(read.text);
      const patterns = compilePatterns(config.patterns);
      cache = { mtimeMs: read.mtimeMs, patterns };
      return patterns;
    } catch {
      // Malformed or transiently unreadable config. NEVER clear the cache:
      // falling back to zero patterns would silently stop redacting and let
      // credentials pass through to the model.
      return broken(read.mtimeMs);
    }
  };
}
