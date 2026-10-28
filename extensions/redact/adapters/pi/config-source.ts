/**
 * Production adapter: reads `~/.pi/agent/redact.json` off the filesystem.
 */

import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ConfigRead, ConfigSource } from "../../ports/config-source.ts";

export const DEFAULT_REDACT_CONFIG_PATH = join(homedir(), ".pi", "agent", "redact.json");

/**
 * Reads a redact.json path, mapping `ENOENT`-style stat failures to `missing`
 * and read failures (e.g. permissions, EISDIR) to `unreadable`.
 */
export function FileConfigSource(path: string = DEFAULT_REDACT_CONFIG_PATH): ConfigSource {
  return {
    read(): ConfigRead {
      let mtimeMs: number;
      try {
        mtimeMs = statSync(path).mtimeMs;
      } catch {
        return { status: "missing" };
      }

      try {
        return { status: "ok", mtimeMs, text: readFileSync(path, "utf-8") };
      } catch {
        return { status: "unreadable", mtimeMs };
      }
    },
  };
}
