/**
 * Applies compiled redaction patterns to tool-result content blocks.
 */

import type { ImageContent, TextContent } from "@earendil-works/pi-ai";

import type { Pattern } from "./patterns.ts";

type ContentBlock = TextContent | ImageContent;

/**
 * Redact sensitive data from text content blocks.
 *
 * Returns `undefined` when there are no patterns to apply (the caller keeps
 * the original content). With patterns, returns a mapped copy with text blocks
 * redacted and image blocks left untouched.
 */
export function redact(content: ContentBlock[] | undefined, patterns: Pattern[]): ContentBlock[] | undefined {
  if (patterns.length === 0) return undefined;

  return (content || []).map((block) => {
    if (block.type !== "text") return block;
    let text = block.text ?? "";
    for (const p of patterns) {
      try {
        text = text.replace(p.regex, p.replacement);
      } catch {
        // Unexpected engine error (e.g. stack overflow on a pathological
        // input) — skip this pattern. Unsafe patterns are filtered by
        // isRegexSafe() at compile time instead.
      }
    }
    return { ...block, text };
  });
}
