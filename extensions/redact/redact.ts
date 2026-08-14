/**
 * Redaction patterns and application logic.
 *
 * Patterns are loaded from ~/.pi/agent/redact.json on every call so
 * edits take effect without a reload. The config stays local to the
 * machine — it contains personal-data patterns (DNI, IBAN, phone, ...)
 * and any credentials that must never reach the model (API keys, tokens).
 */

import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { ImageContent, TextContent } from "@earendil-works/pi-ai";

interface Pattern {
  label: string;
  regex: RegExp;
  replacement: string;
}

type ContentBlock = TextContent | ImageContent;

// Safety bounds: redaction runs synchronously on every read result, so
// pathological user patterns must not be able to block pi (ReDoS) or slow
// it down with huge pattern sets. The length bound below is only a sanity
// cap on pattern size — it does NOT stop catastrophic backtracking. That is
// handled by isRegexSafe(), which rejects nested-repetition, ambiguous-
// alternation, and same-level adjacent-quantifier constructs outright (see
// loadPatterns).
const MAX_PATTERNS = 100;
const MAX_PATTERN_CHARS = 200;

// Pattern cache with mtime-based invalidation: compiling regexes is the
// expensive part, and applyRedaction runs on every read result. A stat() per
// call is cheap and still picks up config edits without a reload.
let patternCache: { mtimeMs: number; patterns: Pattern[] } | null = null;

// Remember the config mtime we last warned about so a persistently broken
// config logs once per change instead of spamming every read.
let lastWarnedMtimeMs = -1;

function loadPatterns(): Pattern[] {
  const configPath = join(homedir(), ".pi", "agent", "redact.json");

  let mtimeMs = -1;
  try {
    mtimeMs = statSync(configPath).mtimeMs;
  } catch {
    // No config file — fast no-op path
    patternCache = null;
    return [];
  }

  if (patternCache && patternCache.mtimeMs === mtimeMs) {
    return patternCache.patterns;
  }

  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    const raw: string[][] = Array.isArray(config.patterns) ? config.patterns.slice(0, MAX_PATTERNS) : [];
    const patterns: Pattern[] = [];
    for (const entry of raw) {
      if (!Array.isArray(entry) || entry.length < 3) continue;
      const [label, regexStr, replacement] = entry;
      if (typeof label !== "string" || typeof regexStr !== "string" || typeof replacement !== "string") continue;
      if (regexStr.length > MAX_PATTERN_CHARS) continue; // skip oversized pattern
      if (!isRegexSafe(regexStr)) continue; // skip ReDoS-unsafe pattern (see isRegexSafe)
      try {
        patterns.push({ label, regex: new RegExp(regexStr, "gi"), replacement });
      } catch {
        // Invalid pattern — skip it individually so one bad entry cannot
        // disable the whole configuration
      }
    }
    patternCache = { mtimeMs, patterns };
    return patterns;
  } catch {
    // Malformed or transiently unreadable config. NEVER clear the cache:
    // falling back to zero patterns would silently stop redacting and let
    // credentials pass through to the model. Keep the last-known-good set
    // and warn once per broken mtime so the user notices the config did not
    // refresh.
    if (patternCache) {
      if (lastWarnedMtimeMs !== mtimeMs) {
        lastWarnedMtimeMs = mtimeMs;
        console.warn(`redact: could not parse ${configPath}; keeping the last-known-good patterns`);
      }
      return patternCache.patterns;
    }
    // No cache yet — the config was never valid. Redact nothing rather than
    // throw on every read (the tool_result handler has no error surface), but
    // warn loudly once so the broken config is not silently disabling
    // redaction.
    if (lastWarnedMtimeMs !== mtimeMs) {
      lastWarnedMtimeMs = mtimeMs;
      console.warn(`redact: ${configPath} is unreadable or invalid — no patterns loaded`);
    }
    return [];
  }
}

/**
 * Conservative ReDoS guard.
 *
 * Catastrophic (exponential) backtracking comes from *nested repetition* —
 * a quantified group whose body can match the same input in many ways, e.g.
 * `(a+)+`, `(a*)*`, `(a?)*`, `(a|aa)+`, `([a-z]+)+`, `((a)+)+` — or from
 * repetition of a group containing alternations/backreferences that leave
 * the match ambiguous. Truncating the pattern or wrapping `String.replace`
 * in try/catch does NOT stop this, so patterns that fail this structural
 * check are rejected outright rather than run.
 *
 * Policy (conservative by design — false positives are acceptable):
 * - a group that is itself repeated (`*`, `+`, `?`, or `{n}` / `{n,}` /
 *   `{n,m}` with a large or unbounded upper bound) must not contain, at any
 *   depth, a repetition, an alternation, or a backreference;
 * - same-level adjacent quantified units are rejected when the later unit is
 *   truly unbounded (`*`, `+`, or `{n,}` with a large upper bound): chained
 *   units like `\w*\w*`, `a?a*`, or `.*.*` give the engine ambiguous split
 *   points and quadratic backtracking, even though each unit alone is safe.
 *   `?` and small bounded repeats (`{n}` / `{n,m}` with upper <= 4) do not
 *   trigger the rule themselves (`a?b?`, `\d{2,3}[\s-]?\d{3}` pass), but a
 *   unit preceded by one still counts — so `a?a*` is caught.
 *
 * Returns false when the pattern fails the policy.
 */
function isRegexSafe(pattern: string): boolean {
  interface Level {
    hasQuantifier: boolean;
    hasAlternation: boolean;
    hasBackref: boolean;
    /** The previous completed unit (atom + quantifier) at this level was quantified. */
    prevQuantified: boolean;
    /** The current unit at this level is quantified (an in-progress quantifier). */
    lastQuantified: boolean;
  }
  const newLevel = (): Level => ({
    hasQuantifier: false,
    hasAlternation: false,
    hasBackref: false,
    prevQuantified: false,
    lastQuantified: false,
  });

  const MAX_BOUND = 4; // upper bound at/under which a `{n,m}` repeat is safe
  // level 0 is the top level; every `(` pushes a new group level
  const stack: Level[] = [newLevel()];
  let inClass = false;
  let i = 0;

  const level = () => stack[stack.length - 1];

  /** A unit is an atom plus its optional quantifier. Start a new unit. */
  const atomStart = () => {
    const l = level();
    l.prevQuantified = l.lastQuantified;
    l.lastQuantified = false;
  };

  /**
   * Apply a quantifier to the current unit. Returns false when the pattern
   * must be rejected. "optional" is `?` (0-or-1 — never ambiguous on its
   * own); "unbounded" is `*`/`+`/`{n,}`-with-large-upper (can match many).
   */
  const applyQuantifier = (kind: "bounded" | "unbounded" | "optional"): boolean => {
    const l = level();
    if (kind === "unbounded") {
      // Adjacent quantified units at the same level (`a*b*`, `\w*\w*`,
      // `a?a*`) are ambiguous — reject when the previous unit was quantified
      // at all. False positives (e.g. `a*b*` with disjoint char sets, or
      // `\d?[.-]?\d+`) are accepted.
      if (l.prevQuantified) return false;
      l.hasQuantifier = true;
    } else if (kind === "optional") {
      // `?` marks the unit as quantified (so `a?a*` is caught above) but is
      // not itself ambiguous enough to reject (`a?b?` is linear).
      l.hasQuantifier = true;
    }
    l.lastQuantified = true;
    return true;
  };

  /** Classify the quantifier at index `i` (if any) and return its end index. */
  const quantifierAt = (i: number): { kind: "none" | "bounded" | "unbounded" | "optional"; end: number } => {
    const c = pattern[i];
    if (c === "*" || c === "+") {
      return { kind: "unbounded", end: i + 1 };
    }
    if (c === "?") {
      return { kind: "optional", end: i + 1 };
    }
    if (c === "{") {
      const close = pattern.indexOf("}", i + 1);
      if (close === -1) return { kind: "none", end: i };
      const body = pattern.slice(i + 1, close);
      const m = body.match(/^(\d+)(?:,(\d*))?$/);
      if (!m) return { kind: "none", end: i }; // `{` is a literal here
      const upper = m[2] === undefined ? parseInt(m[1], 10) : m[2] === "" ? Infinity : parseInt(m[2], 10);
      return { kind: upper <= MAX_BOUND ? "bounded" : "unbounded", end: close + 1 };
    }
    return { kind: "none", end: i };
  };

  while (i < pattern.length) {
    const c = pattern[i];

    if (c === "\\") {
      // Escaped char; `\1`-`\9` is a backreference (a repetition ambiguity
      // signal when it lives inside a repeated group).
      const next = pattern[i + 1];
      if (!inClass && next !== undefined && next >= "1" && next <= "9" && stack.length > 1) {
        level().hasBackref = true;
      }
      atomStart();
      i += 2;
      continue;
    }

    if (inClass) {
      if (c === "]") inClass = false;
      i++;
      continue;
    }

    if (c === "[") {
      inClass = true;
      atomStart();
      i++;
      continue;
    }

    if (c === "(") {
      // Skip the `(?...)` prefix (?:, ?=, ?!, ?<=, ?<!, ?<name>).
      const m = pattern.slice(i + 1).match(/^\?(?:[:=!]|<[=!]|<[A-Za-z_][A-Za-z0-9_]*>)/);
      stack.push(newLevel());
      i += 1 + (m ? m[0].length : 0);
      continue;
    }

    if (c === ")") {
      const frame = stack.pop();
      if (!frame) {
        i++; // unbalanced — let `new RegExp` surface the real error
        continue;
      }
      // The group is a unit of the enclosing level — start it, then attach
      // the group's own quantifier (if any) to it.
      atomStart();
      const q = quantifierAt(i + 1);
      if (q.kind !== "none") {
        // This group is repeated. Reject when its body contains a repetition
        // (nested), an alternation, or a backreference — unless the repeat
        // is a small bounded `{n}`/`{n,m}`.
        if (q.kind === "unbounded" && (frame.hasQuantifier || frame.hasAlternation || frame.hasBackref)) {
          return false;
        }
        if (!applyQuantifier(q.kind)) return false;
        i = q.end;
      } else {
        i++;
      }
      // Propagate flags into the enclosing group so `(?:(a+))+` is caught:
      // the inner group's quantifier is a signal for the outer one.
      if (stack.length > 0 && (frame.hasQuantifier || frame.hasAlternation || frame.hasBackref)) {
        const parent = level();
        parent.hasQuantifier = parent.hasQuantifier || frame.hasQuantifier;
        parent.hasAlternation = parent.hasAlternation || frame.hasAlternation;
        parent.hasBackref = parent.hasBackref || frame.hasBackref;
      }
      continue;
    }

    if (c === "|" && stack.length > 1) {
      level().hasAlternation = true;
      i++;
      continue;
    }

    const q = quantifierAt(i);
    if (q.kind !== "none") {
      // Quantifier on the atom just seen at this level.
      if (!applyQuantifier(q.kind)) return false;
      i = q.end;
      continue;
    }

    // Plain literal character — starts a new unit at this level.
    atomStart();
    i++;
  }
  return true;
}

/**
 * Redact sensitive data from text content blocks.
 * Returns undefined when there is nothing to redact (caller keeps original).
 */
export function applyRedaction(content: ContentBlock[] | undefined): ContentBlock[] | undefined {
  const patterns = loadPatterns();
  if (patterns.length === 0) return undefined;

  return (content || []).map((block) => {
    if (block.type !== "text") return block;
    let text = block.text ?? "";
    for (const p of patterns) {
      try {
        text = text.replace(p.regex, p.replacement);
      } catch {
        // Unexpected engine error (e.g. stack overflow on a pathological
        // input) — skip this pattern. Note: this catch cannot interrupt
        // catastrophic backtracking; unsafe patterns are filtered by
        // isRegexSafe() at load time instead.
      }
    }
    return { ...block, text };
  });
}
