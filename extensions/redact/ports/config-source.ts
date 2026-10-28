/**
 * Outbound port: redaction config source.
 *
 * The domain needs the current snapshot of `~/.pi/agent/redact.json` (or any
 * alternate source) together with its mtime so it can decide cache
 * invalidation. It does not care whether the bytes come from a file, a test
 * fake, or elsewhere.
 */

export type ConfigRead =
  { status: "missing" } | { status: "ok"; mtimeMs: number; text: string } | { status: "unreadable"; mtimeMs: number };

export interface ConfigSource {
  /** Read the config snapshot synchronously (the event handler is sync). */
  read(): ConfigRead;
}
