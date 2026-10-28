/**
 * Adapter test: `ConsoleWarnSink` routes warnings to the supplied writer.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ConsoleWarnSink } from "../extensions/redact/adapters/pi/warn-sink.ts";

describe("ConsoleWarnSink", () => {
  it("routes the message to the injected writer", () => {
    const messages: string[] = [];
    ConsoleWarnSink((message) => messages.push(message)).warn("hello");
    assert.deepEqual(messages, ["hello"]);
  });
});
