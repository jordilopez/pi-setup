/**
 * `read`-result redaction adapter: builds the pattern loader from the
 * filesystem config and a console sink, then subscribes to `tool_result`.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { createPatternLoader } from "../../domain/loader.ts";
import { redact } from "../../domain/redactor.ts";
import { DEFAULT_REDACT_CONFIG_PATH, FileConfigSource } from "./config-source.ts";
import { ConsoleWarnSink } from "./warn-sink.ts";

/**
 * Redacts `read` tool results on the fly, using patterns from
 * `~/.pi/agent/redact.json` (re-read with mtime invalidation on every call).
 */
export function registerReadRedaction(pi: ExtensionAPI): void {
  const loader = createPatternLoader(
    FileConfigSource(DEFAULT_REDACT_CONFIG_PATH),
    ConsoleWarnSink(),
    DEFAULT_REDACT_CONFIG_PATH,
  );

  pi.on("tool_result", (event) => {
    if (event.toolName !== "read") return;

    const content = redact(event.content, loader());
    if (!content) return;

    return { content };
  });
}
