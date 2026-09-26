/**
 * git_classify_changes — deterministic classification of the working tree.
 *
 * Exports `classifyGitChanges` as a pure function (no I/O) so tests can
 * exercise it without spawning git. `registerGitClassifyChanges` wires the
 * pure function into a Pi tool that captures git output and returns a
 * structured `details` payload plus a one-line human summary.
 *
 * Detection rules (kept simple on purpose — the LLM still does prose work):
 *   packageSet    — derived from path roots: skills/<name>, extensions/<name>,
 *                   scripts, root.
 *   inferredTypes — per-file when the diff has `diff --git` headers; global
 *                   entries with file=null when it doesn't.
 *   mode:
 *     - "empty"        when nothing changed
 *     - "split_by_type"when more than one distinct commit type is inferred
 *     - "split"        when more than one package is touched, one type
 *     - "single"       when files ≤ 3, one (non-root) package, ≤ 1 type
 *     - "ambiguous"    fallback; the model should ask the user
 *   recommendation — "SINGLE_COMMIT" for single mode, otherwise "SPLIT_NEEDED"
 */

import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TextContent } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const CONVENTIONAL_TYPES = ["feat", "fix", "refactor", "perf", "test", "docs", "chore", "style", "build", "ci"];

export interface ClassifyInput {
  /** Lines from `git status --porcelain` (may include trailing CR) */
  statusLines: string[];
  /** A sample of `git diff` output (staged + unstaged) used to infer types */
  diffSample: string;
}

export interface InferredTypeEntry {
  /** File the type was attached to, or null when inferred from header-less diff */
  file: string | null;
  /** Conventional commit type, lowercase */
  type: string;
}

export interface ClassifyResult {
  mode: "empty" | "single" | "split" | "split_by_type" | "ambiguous";
  packageSet: string[];
  inferredTypes: InferredTypeEntry[];
  fileCount: number;
  stagedOnly: boolean;
  untracked: string[];
  recommendation: "SINGLE_COMMIT" | "SPLIT_NEEDED";
  rationale: string;
}

interface ParsedStatus {
  files: string[];
  untracked: string[];
  stagedOnly: boolean;
}

/**
 * Parse `git status --porcelain` output. Porcelain v1 columns:
 *   XY filename
 * where X is the staged status and Y is the unstaged status. " "
 * means no change in that column.
 */
export function parseStatus(statusLines: string[]): ParsedStatus {
  const files: string[] = [];
  const untracked: string[] = [];
  let allStaged = true;
  for (const raw of statusLines) {
    if (!raw) continue;
    const code = raw.slice(0, 2);
    const name = raw.slice(3).trim();
    if (!name) continue;
    if (code === "??") {
      untracked.push(name);
      // untracked is neither staged nor unstaged — keep allStaged true if no unstaged-only later
      continue;
    }
    files.push(name);
    // Y column non-space means there is an unstaged change
    if (code[1] !== " " && code[1] !== "?") allStaged = false;
  }
  return { files, untracked, stagedOnly: files.length > 0 && allStaged };
}

/**
 * Derive the package name from a path. Returns:
 *   "skills/<name>"  for skills/<name>/...
 *   "extensions/<n>" for extensions/<name>/...
 *   "scripts"        for scripts/...
 *   "root"           otherwise
 */
export function packageOf(filePath: string): string {
  const skills = filePath.match(/^skills\/([^/]+)(\/|$)/);
  if (skills) return `skills/${skills[1]}`;
  const extensions = filePath.match(/^extensions\/([^/]+)(\/|$)/);
  if (extensions) return `extensions/${extensions[1]}`;
  if (filePath.startsWith("scripts/") || filePath === "scripts") return "scripts";
  return "root";
}

/**
 * Parse a diff sample and pull out per-file inferred types when the diff
 * has `diff --git a/PATH b/PATH` headers. Each header opens a "current file"
 * scope; the next `^+type(...):` line in that scope attaches a type to that
 * file. When the diff has no headers (some shells strip them), emit global
 * entries with file=null.
 */
export function parseInferredTypes(diffSample: string): InferredTypeEntry[] {
  const result: InferredTypeEntry[] = [];
  const lines = diffSample.split("\n");
  let currentFile: string | null = null;
  let seenHeader = false;

  for (const line of lines) {
    const header = line.match(/^diff --git a\/(.+?) b\/.+?$/);
    if (header) {
      seenHeader = true;
      currentFile = header[1];
      continue;
    }
    if (!line.startsWith("+")) continue;
    const m = line.match(/^\+\s*([a-z]+)(?:\([^)]*\))?\s*:/);
    if (!m) continue;
    const type = m[1].toLowerCase();
    if (!CONVENTIONAL_TYPES.includes(type)) continue;
    result.push({ file: seenHeader ? currentFile : null, type });
  }

  return result;
}

/**
 * Pure classifier: turns structured git output into a deterministic
 * classification. No I/O. Tested in tests/git-classify.test.ts.
 */
export function classifyGitChanges(input: ClassifyInput): ClassifyResult {
  const status = parseStatus(input.statusLines);
  const inferredTypes = parseInferredTypes(input.diffSample);
  const distinctTypes = new Set(inferredTypes.map((t) => t.type));
  const packageSet = Array.from(new Set(status.files.map(packageOf))).sort();

  const fileCount = status.files.length + status.untracked.length;
  const packages = packageSet.length;

  let mode: ClassifyResult["mode"];
  let rationale: string;

  if (fileCount === 0) {
    mode = "empty";
    rationale = "Working tree is clean.";
  } else if (distinctTypes.size > 1) {
    mode = "split_by_type";
    rationale = `${distinctTypes.size} distinct commit types detected: ${[...distinctTypes].join(", ")}.`;
  } else if (packages > 1) {
    mode = "split";
    rationale = `${packages} packages touched with one inferred type.`;
  } else if (packages === 1 && packageSet[0] !== "root" && fileCount <= 3 && distinctTypes.size <= 1) {
    mode = "single";
    rationale = `${fileCount} file(s) in ${packageSet[0]} with at most one inferred type.`;
  } else {
    mode = "ambiguous";
    rationale = `Files=${fileCount}, packages=${packages}, types=${distinctTypes.size}. LLM should ask the user.`;
  }

  const recommendation = mode === "single" || mode === "empty" ? "SINGLE_COMMIT" : "SPLIT_NEEDED";

  return {
    mode,
    packageSet,
    inferredTypes,
    fileCount,
    stagedOnly: status.stagedOnly,
    untracked: status.untracked,
    recommendation,
    rationale,
  };
}

/**
 * Capture a bounded sample of the working-tree diff for type inference.
 * Strips uninteresting lines (`-`, `index`, `---`, `+++`) and keeps the
 * `diff --git` headers plus `+` lines that may carry commit markers.
 */
async function captureDiffSample(cwd: string, maxBytes = 16 * 1024): Promise<string> {
  const parts: string[] = [];
  let total = 0;
  for (const cmd of [
    ["diff"],
    ["diff", "--cached"],
    ["diff", "--no-index", "--color=never", "/dev/null", "--"],
  ] as const) {
    try {
      const { stdout } = await execFileAsync("git", ["-c", "color.ui=never", ...cmd], {
        cwd,
        maxBuffer: 2 * 1024 * 1024,
        timeout: 15_000,
      });
      const text = stdout || "";
      // keep headers and added lines
      const kept = text
        .split("\n")
        .filter((l) => l.startsWith("diff --git") || l.startsWith("+"))
        .join("\n");
      if (kept) {
        if (total + kept.length > maxBytes) return parts.join("\n").slice(0, maxBytes);
        parts.push(kept);
        total += kept.length;
      }
    } catch {
      // `git diff` exits non-zero when there is no diff or no upstream — ignore.
    }
  }
  return parts.join("\n").slice(0, maxBytes);
}

export function registerGitClassifyChanges(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "git_classify_changes",
    label: "git_classify_changes",
    description:
      "Inspect the working tree and return a deterministic classification " +
      "(mode, packageSet, inferredTypes, fileGroups, recommendation) so the " +
      "model can decide single-vs-split without re-reading git status.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd;
      try {
        const { stdout: statusOut } = await execFileAsync("git", ["-c", "color.ui=never", "status", "--porcelain"], {
          cwd,
          timeout: 15_000,
          maxBuffer: 2 * 1024 * 1024,
        });
        const statusLines = (statusOut || "").split("\n").filter((l) => l.length > 0);

        if (statusLines.length === 0) {
          const clean = classifyGitChanges({ statusLines: [], diffSample: "" });
          return {
            content: [{ type: "text", text: "Working tree is clean — nothing to classify." }] as TextContent[],
            details: { ...clean },
          };
        }

        const diffSample = await captureDiffSample(cwd);
        const result = classifyGitChanges({ statusLines, diffSample });

        return {
          content: [
            {
              type: "text",
              text: `mode=${result.mode} recommendation=${result.recommendation} packages=[${result.packageSet.join(",")}] rationale=${result.rationale}`,
            },
          ] as TextContent[],
          details: { ...result },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/not a git repository/i.test(msg)) {
          return errorResult("not a git repository");
        }
        return errorResult(msg);
      }
    },
  });
}

function errorResult(message: string) {
  return {
    content: [{ type: "text", text: `git_classify_changes: ${message}` }] as TextContent[],
    details: { error: message },
  };
}
