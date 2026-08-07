/**
 * Redact sensitive data from `read` tool results.
 *
 * Registers no tool — it is event-based: patterns from
 * ~/.pi/agent/redact.json are applied to read results on the fly.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { applyRedaction } from "./redact.ts";

export default function (pi: ExtensionAPI) {
  pi.on("tool_result", (event) => {
    if (event.toolName !== "read") return;

    const content = applyRedaction(event.content as Parameters<typeof applyRedaction>[0]);
    if (!content) return;

    return { content };
  });
}
