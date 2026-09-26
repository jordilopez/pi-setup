/**
 * frontend_tip_pick_topic — deterministic topic selection for the
 * frontend-tip skill.
 *
 * Exports `pickTopic` as a pure function (covered entries in, topic out) so
 * tests run without touching the filesystem, and `registerFrontendTipPicker`
 * as the Pi tool that reads the project's `.pi/frontend-tip-covered.md` log.
 *
 * Log format (from skills/frontend-tip/SKILL.md):
 *   - YYYY-MM-DD | Topic | Tip title
 * Parsed by splitting on the first two `|` characters; the topic never
 * contains `|` because it always comes from the fixed topic list.
 */

import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TextContent } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Fixed default topic list from skills/frontend-tip/SKILL.md. */
export const DEFAULT_TOPICS = [
  "Vue",
  "React",
  "Angular",
  "browser APIs",
  "JavaScript",
  "TypeScript",
  "SCSS",
  "CSS",
  "Vite",
  "Webpack",
  "Astro",
  "Next.js",
  "GraphQL",
  "Nuxt",
  "REST API design",
] as const;

export interface CoveredEntry {
  date: string;
  topic: string;
  title: string;
}

export interface PickInput {
  namedTopic?: string | undefined;
  coveredEntries: CoveredEntry[];
}

export interface PickResult {
  pickedTopic: string;
  wasNamed: boolean;
  wrapped: boolean;
  coveredLogSize: number;
}

/**
 * Parse one coverage-log line. Splits on the first two `|` characters only,
 * so a title containing `|` survives intact.
 */
export function parseCoverageLine(line: string): CoveredEntry | null {
  const m = line.match(/^\s*-\s*(\d{4}-\d{2}-\d{2})\s*\|\s*([^|]+?)\s*\|\s*(.+?)\s*$/);
  if (!m) return null;
  return { date: m[1], topic: m[2], title: m[3] };
}

/**
 * Pure topic picker. Tested in tests/frontend-tip-picker.test.ts.
 */
export function pickTopic(input: PickInput): PickResult {
  const name = input.namedTopic?.trim();
  if (name) {
    return { pickedTopic: name, wasNamed: true, wrapped: false, coveredLogSize: input.coveredEntries.length };
  }

  const defaults = DEFAULT_TOPICS as readonly string[];
  const inList = input.coveredEntries.filter((e) => defaults.includes(e.topic));
  const coveredSet = new Set(inList.map((e) => e.topic));

  const uncovered = defaults.filter((t) => !coveredSet.has(t));
  if (uncovered.length > 0) {
    return {
      pickedTopic: uncovered[0],
      wasNamed: false,
      wrapped: false,
      coveredLogSize: inList.length,
    };
  }

  // All defaults covered — pick the least-recently-covered (oldest date).
  const sorted = [...inList].sort((a, b) => a.date.localeCompare(b.date));
  return {
    pickedTopic: sorted[0]?.topic ?? defaults[0],
    wasNamed: false,
    wrapped: true,
    coveredLogSize: inList.length,
  };
}

async function resolveProjectRoot(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], { cwd, timeout: 5_000 });
    return stdout.trim() || cwd;
  } catch {
    return cwd;
  }
}

export function registerFrontendTipPicker(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "frontend_tip_pick_topic",
    label: "frontend_tip_pick_topic",
    description:
      "Pick the next frontend tip topic from the project's coverage log " +
      "(.pi/frontend-tip-covered.md): the named topic if given, else the first " +
      "uncovered default, else the least-recently-covered with wrapped=true.",
    parameters: Type.Object({
      namedTopic: Type.Optional(Type.String({ description: "Topic the user explicitly named, if any" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const root = await resolveProjectRoot(ctx.cwd);
      const logPath = join(root, ".pi", "frontend-tip-covered.md");

      let coveredEntries: CoveredEntry[] = [];
      try {
        const log = readFileSync(logPath, "utf8");
        coveredEntries = log
          .split("\n")
          .map(parseCoverageLine)
          .filter((e): e is CoveredEntry => e !== null);
      } catch {
        // Missing/unreadable log → proceed as if nothing had been covered.
        coveredEntries = [];
      }

      const result = pickTopic({ namedTopic: params.namedTopic, coveredEntries });

      return {
        content: [
          {
            type: "text",
            text: `pickedTopic=${result.pickedTopic} wasNamed=${result.wasNamed} wrapped=${result.wrapped} coveredLogSize=${result.coveredLogSize}`,
          },
        ] as TextContent[],
        details: { ...result, logPath },
      };
    },
  });
}
