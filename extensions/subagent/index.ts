/**
 * Subagent extension entry point.
 *
 * Registers the `subagent` tool (one file per tool — the tool itself lives
 * in subagent.ts; agents.ts discovers agent definitions).
 *
 * Derived from the pi subagent example extension.
 * Source: https://github.com/earendil-works/pi (MIT License)
 * Copyright (c) earendil-works and pi contributors
 * https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/subagent/
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerSubagentTool } from "./subagent.ts";

export default function (pi: ExtensionAPI) {
  registerSubagentTool(pi);
}
