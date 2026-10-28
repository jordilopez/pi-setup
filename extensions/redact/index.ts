/**
 * Redact sensitive data from `read` tool results.
 *
 * Registers no tool — it is event-based: patterns from
 * ~/.pi/agent/redact.json are applied to read results on the fly.
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { registerReadRedaction } from "./adapters/pi/redact.ts";

export default function (pi: ExtensionAPI) {
  registerReadRedaction(pi);
}
