/**
 * read_matching - Enhanced with wholeWord support
 *
 * Overrides the built-in read_matching tool to add a `wholeWord` boolean parameter.
 * When wholeWord is true, word boundaries (\b) are automatically added so that
 * searching for "id" doesn't also match "identity", "customId", etc.
 *
 * Uses ripgrep (rg) when available, falls back to grep.
 * Commands are run via execFile with an argument array (no shell), so user
 * input cannot inject shell syntax.
 */

import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TextContent } from "@earendil-works/pi-ai";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { Type } from "typebox";

const execFileAsync = promisify(execFile);

// Maximum output size to return (50KB like built-in read)
const MAX_OUTPUT_BYTES = 50 * 1024;

// Cached ripgrep probe: the in-flight promise is stored on first use so the
// probe runs at most once per process lifetime, even under concurrent calls.
let rgProbe: Promise<boolean> | undefined;

/**
 * Check if ripgrep is available. The probe promise is cached, so concurrent
 * callers await the same in-flight check instead of launching more probes.
 */
function hasRipgrep(): Promise<boolean> {
  if (!rgProbe) {
    rgProbe = execFileAsync("rg", ["--version"], { timeout: 2000 }).then(
      () => true,
      () => false,
    );
  }
  return rgProbe;
}

interface SearchArgs {
  filePath: string;
  pattern: string;
  contextLines: number;
  isRegex: boolean;
  wholeWord: boolean;
  useRipgrep: boolean;
}

/**
 * Build the search command arguments (no shell involved — safe against
 * injection via pattern or file path).
 */
function buildArgs(args: SearchArgs): { bin: string; args: string[] } {
  const { filePath, pattern, contextLines, isRegex, wholeWord, useRipgrep } = args;

  if (useRipgrep) {
    const rgArgs: string[] = ["--color", "never", "--line-number", "--case-sensitive"];
    if (contextLines > 0) rgArgs.push("-C", String(contextLines));
    if (!isRegex) rgArgs.push("--fixed-strings");
    if (wholeWord) rgArgs.push("--word-regexp");
    rgArgs.push("--", pattern, filePath);
    return { bin: "rg", args: rgArgs };
  }

  const grepArgs: string[] = ["-n", "--color=never"];
  if (contextLines > 0) grepArgs.push("-C", String(contextLines));
  if (!isRegex) grepArgs.push("-F");
  if (wholeWord) grepArgs.push("-w");
  grepArgs.push("--", pattern, filePath);
  return { bin: "grep", args: grepArgs };
}

const TRUNCATION_MARKER = "\n\n[Output truncated at 50KB]";

/**
 * Parse rg/grep output into structured result (byte-aware truncation so
 * multibyte UTF-8 never exceeds the advertised cap — the truncation marker
 * is reserved BEFORE slicing so the returned text stays within 50KB).
 */
function parseOutput(output: string): { text: string; lineCount: number } {
  if (!output.trim()) {
    return { text: "", lineCount: 0 };
  }

  const lines = output.split("\n");
  // rg/grep output usually ends with a newline, which splits into a trailing
  // empty element — don't count that as a line.
  const lineCount = lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
  let text = lines.join("\n");
  const byteLength = Buffer.byteLength(text, "utf-8");

  if (byteLength > MAX_OUTPUT_BYTES) {
    // Reserve room for the marker, then byte-slice to fit the whole result
    // (marker + content) inside the 50KB cap.
    const budget = MAX_OUTPUT_BYTES - Buffer.byteLength(TRUNCATION_MARKER, "utf-8");
    let truncated = text.slice(0, budget);
    while (Buffer.byteLength(truncated, "utf-8") > budget) {
      truncated = truncated.slice(0, -1);
    }
    text = truncated + TRUNCATION_MARKER;
  }

  return { text, lineCount };
}

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "read_matching",
    label: "read_matching (enhanced)",
    description:
      "Search for a pattern in a file and read matching lines with surrounding context. " +
      "Uses ripgrep (rg) or falls back to grep. " +
      "Supports wholeWord matching to find identifiers precisely without substring false positives.",
    parameters: Type.Object({
      path: Type.String({
        description: "Path to the file (relative or absolute)",
      }),
      pattern: Type.String({
        description: "Search pattern to find in the file",
      }),
      contextLines: Type.Optional(
        Type.Number({
          description: "Number of context lines before and after each match (default: 10)",
        }),
      ),
      maxMatches: Type.Optional(
        Type.Number({
          description: "Maximum number of match groups to show, 0 = unlimited (default: 5)",
        }),
      ),
      regex: Type.Optional(
        Type.Boolean({
          description: "Treat pattern as a regex instead of a literal string (default: false)",
        }),
      ),
      wholeWord: Type.Optional(
        Type.Boolean({
          description:
            "Match whole words only. When true, word boundaries are applied so " +
            "searching for 'id' won't match 'identity', 'customId', etc. " +
            "Works with both literal and regex patterns. (default: false)",
        }),
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const { path: filePath, pattern, contextLines = 10, maxMatches = 5, regex = false, wholeWord = false } = params;

      const absolutePath = resolve(ctx.cwd, filePath);

      // Validate file exists
      if (!existsSync(absolutePath)) {
        return {
          content: [
            {
              type: "text",
              text: `File not found: ${filePath}`,
            },
          ] as TextContent[],
          details: { error: true },
        };
      }

      // Check if ripgrep is available
      const useRipgrep = await hasRipgrep();

      const { bin, args } = buildArgs({
        filePath: absolutePath,
        pattern,
        contextLines,
        isRegex: regex,
        wholeWord,
        useRipgrep,
      });

      try {
        const { stdout } = await execFileAsync(bin, args, {
          timeout: 30_000,
          // Allow a bounded larger buffer; parseOutput truncates to 50KB.
          // (A ~51KB maxBuffer would fail large valid searches before truncation.)
          maxBuffer: 2 * 1024 * 1024,
          // Abort the child when the tool call is cancelled (no orphan rg/grep)
          signal,
        });

        const { text, lineCount } = parseOutput(stdout);

        if (!text) {
          return {
            content: [
              {
                type: "text",
                text: `No matches found for pattern: ${pattern}`,
              },
            ] as TextContent[],
            details: { matches: 0 },
          };
        }

        // Apply maxMatches limit to output
        let resultText = text;
        if (maxMatches > 0) {
          // rg output: each match group is separated by -- separator lines
          // We count groups by splitting on lines that are just "--"
          const groups = resultText.split(/\n(?=--\n)/);
          if (groups.length > maxMatches) {
            const limited = groups.slice(0, maxMatches);
            resultText =
              limited.join("\n") + "\n[Showing first " + maxMatches + " of " + groups.length + " match groups]";
          }
        }

        return {
          content: [{ type: "text", text: resultText }] as TextContent[],
          details: {
            matches: lineCount,
            tool: useRipgrep ? "rg" : "grep",
            wholeWord,
            regex,
          },
        };
      } catch (error: any) {
        // Tool call aborted — report cancellation, not a search error
        if (error?.name === "AbortError") {
          return {
            content: [{ type: "text", text: "Search cancelled" }] as TextContent[],
            details: { error: "cancelled" },
          };
        }
        // rg/grep exits with code 1 when no matches found
        if (error.code === 1) {
          return {
            content: [
              {
                type: "text",
                text: `No matches found for pattern: ${pattern}`,
              },
            ] as TextContent[],
            details: { matches: 0 },
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `Error searching file: ${error.message}`,
            },
          ] as TextContent[],
          details: { error: true },
        };
      }
    },
  });
}
