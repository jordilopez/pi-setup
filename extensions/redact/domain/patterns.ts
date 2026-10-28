/**
 * Pattern compilation and the domain's safety bounds.
 *
 * Turns the raw `config.patterns` value from redact.json into compiled
 * `Pattern`s, dropping entries that are malformed, oversized, ReDoS-unsafe, or
 * invalid regexes so one bad entry can never disable the whole config.
 */

import { isRegexSafe } from "./pattern-safety.ts";

/** A compiled redaction pattern. */
export interface Pattern {
  label: string;
  regex: RegExp;
  replacement: string;
}

/**
 * Safety bounds: redaction runs synchronously on every read result, so
 * pathological user patterns must not block pi (ReDoS) or slow it down with
 * huge pattern sets. `MAX_PATTERN_CHARS` is only a sanity cap — catastrophic
 * backtracking is prevented by `isRegexSafe`, not by length.
 */
export const MAX_PATTERNS = 100;
export const MAX_PATTERN_CHARS = 200;

/**
 * Compiles the raw `patterns` array from the config into {@link Pattern}s.
 * Each entry must be a `[label, regex, replacement]` triple of strings;
 * oversized, ReDoS-unsafe, or syntactically invalid regexes are skipped.
 */
export function compilePatterns(raw: unknown): Pattern[] {
  const entries = Array.isArray(raw) ? raw.slice(0, MAX_PATTERNS) : [];
  const patterns: Pattern[] = [];
  for (const entry of entries) {
    if (!Array.isArray(entry) || entry.length < 3) continue;
    const [label, regexStr, replacement] = entry;
    if (typeof label !== "string" || typeof regexStr !== "string" || typeof replacement !== "string") continue;
    if (regexStr.length > MAX_PATTERN_CHARS) continue; // skip oversized pattern
    if (!isRegexSafe(regexStr)) continue; // skip ReDoS-unsafe pattern
    try {
      patterns.push({ label, regex: new RegExp(regexStr, "gi"), replacement });
    } catch {
      // Invalid pattern — skip it individually so one bad entry cannot
      // disable the whole configuration.
    }
  }
  return patterns;
}
