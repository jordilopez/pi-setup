/**
 * Redaction patterns and application logic.
 *
 * Patterns are loaded from ~/.pi/agent/redact.json on every call so
 * edits take effect without a reload. The config stays local to the
 * machine — it contains personal-data patterns (DNI, IBAN, phone, ...).
 */

import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface Pattern {
  label: string;
  regex: RegExp;
  replacement: string;
}

type ContentBlock = { type: string; text?: string };

function loadPatterns(): Pattern[] {
  const configPath = join(homedir(), ".pi", "agent", "redact.json");
  if (!existsSync(configPath)) {
    return [];
  }
  try {
    const config = JSON.parse(readFileSync(configPath, "utf-8"));
    return (config.patterns || []).map(([label, regexStr, replacement]: string[]) => ({
      label,
      regex: new RegExp(regexStr, "gi"),
      replacement,
    }));
  } catch {
    return [];
  }
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
      text = text.replace(p.regex, p.replacement);
    }
    return { ...block, text };
  });
}
