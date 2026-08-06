import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

interface Pattern {
  label: string;
  regex: RegExp;
  replacement: string;
}

export default function (pi: ExtensionAPI) {
  let patterns: Pattern[] = [];

  function loadPatterns() {
    const configPath = join(homedir(), ".pi", "agent", "redact.json");
    if (!existsSync(configPath)) {
      patterns = [];
      return;
    }
    try {
      const config = JSON.parse(readFileSync(configPath, "utf-8"));
      patterns = (config.patterns || []).map(
        ([label, regexStr, replacement]: string[]) => ({
          label,
          regex: new RegExp(regexStr, "gi"),
          replacement,
        })
      );
    } catch (e) {
      patterns = [];
    }
  }

  // Load patterns on startup
  loadPatterns();

  // Intercept tool results to redact sensitive data
  pi.on("tool_result", (event, _ctx) => {
    // Only process read results
    if (event.toolName !== "read") return;

    // Reload patterns each time (so user can edit redact.json live)
    loadPatterns();

    if (patterns.length === 0) return;

    // Apply redaction to each text content block
    const modified = (event.content || []).map((block: any) => {
      if (block.type !== "text") return block;
      let text = block.text;
      for (const p of patterns) {
        text = text.replace(p.regex, p.replacement);
      }
      return { ...block, text };
    });

    return { content: modified };
  });
}
