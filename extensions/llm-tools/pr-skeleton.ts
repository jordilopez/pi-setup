/**
 * pr_skeleton — deterministic PR draft skeleton.
 *
 * Exports `buildSkeleton` as a pure function (tested without git) and
 * `registerPRSkeleton` as the Pi tool that captures git output and returns
 * a structured draft: title stub, file groups, commit subjects, base ref.
 * The model composes prose from this skeleton instead of re-reading the
 * branch diff itself.
 *
 * Trunk branches are refused — a PR from main/master/develop is a mistake,
 * and the deterministic check costs nothing.
 */

import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TextContent } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Same list as extensions/git/common.ts. Inlined to keep this module pure-testable. */
export const TRUNK_BRANCHES = ["master", "main", "develop"];

export interface FileGroup {
  package: string;
  files: string[];
  insertions: number;
  deletions: number;
}

export interface SkeletonInput {
  branch: string;
  baseRef: string;
  commitSubjects: string[];
  /** Lines from `git diff --stat <base>...HEAD` */
  diffStatLines: string[];
}

export interface Skeleton {
  titleStub: string;
  baseRef: string;
  commitSubjects: string[];
  fileGroups: FileGroup[];
  error?: "trunk_branch";
}

/**
 * Pure skeleton builder. Tested in tests/pr-skeleton.test.ts.
 */
export function buildSkeleton(input: SkeletonInput): Skeleton {
  if (TRUNK_BRANCHES.includes(input.branch)) {
    return {
      titleStub: input.branch,
      baseRef: input.baseRef,
      commitSubjects: [],
      fileGroups: [],
      error: "trunk_branch",
    };
  }

  const groups = new Map<string, FileGroup>();
  for (const line of input.diffStatLines) {
    // diff --stat lines look like: " path/to/file.ts | 12 +++++-----"
    const m = line.match(/^\s*(.+?)\s+\|\s+(\d+)\s+([+-]*)\s*$/);
    if (!m) continue;
    const [, file, countStr, bars] = m;
    const pkg = packageOf(file);
    const group = groups.get(pkg) ?? { package: pkg, files: [], insertions: 0, deletions: 0 };
    group.files.push(file);
    const count = Number(countStr);
    const plus = (bars.match(/\+/g) ?? []).length;
    const minus = (bars.match(/-/g) ?? []).length;
    if (plus + minus === 0) {
      // binary or new file without bars — attribute the count as insertions
      group.insertions += count;
    } else {
      group.insertions += Math.round((count * plus) / (plus + minus));
      group.deletions += Math.round((count * minus) / (plus + minus));
    }
    groups.set(pkg, group);
  }

  return {
    titleStub: input.branch,
    baseRef: input.baseRef,
    commitSubjects: input.commitSubjects,
    fileGroups: Array.from(groups.values()).sort((a, b) => b.files.length - a.files.length),
  };
}

/** Same package-root convention as git-classify (kept local to stay pure). */
function packageOf(filePath: string): string {
  const skills = filePath.match(/^skills\/([^/]+)(\/|$)/);
  if (skills) return `skills/${skills[1]}`;
  const extensions = filePath.match(/^extensions\/([^/]+)(\/|$)/);
  if (extensions) return `extensions/${extensions[1]}`;
  if (filePath.startsWith("scripts/") || filePath === "scripts") return "scripts";
  return "root";
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-c", "color.ui=never", ...args], {
    cwd,
    timeout: 15_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return stdout ?? "";
}

export function registerPRSkeleton(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "pr_skeleton",
    label: "pr_skeleton",
    description:
      "Build a structured PR draft (title stub, per-package file groups, commit " +
      "subjects, base ref) from the current branch so the model only writes the " +
      "prose. Refuses trunk branches.",
    parameters: Type.Object({
      base: Type.Optional(Type.String({ description: "Base ref (default: origin/main, then origin/master)" })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd;
      try {
        const branch = (await git(cwd, "branch", "--show-current")).trim();
        if (!branch) return errorResult("not on a branch (detached HEAD?)");

        let baseRef = params.base?.trim() || "";
        if (!baseRef) {
          for (const candidate of ["origin/main", "origin/master"]) {
            const code = await execFileAsync("git", ["show-ref", "--verify", "--quiet", candidate], {
              cwd,
              timeout: 15_000,
            }).then(
              () => true,
              () => false,
            );
            if (code) {
              baseRef = candidate;
              break;
            }
          }
        }
        if (!baseRef) return errorResult("no base ref found (tried origin/main, origin/master)");

        const logOut = await git(cwd, "log", "--oneline", `${baseRef}..HEAD`);
        const commitSubjects = logOut
          .split("\n")
          .map((l) => l.replace(/^[0-9a-f]{7,}\s+/, "").trim())
          .filter(Boolean);

        const statOut = await git(cwd, "diff", "--stat", `${baseRef}...HEAD`);
        const diffStatLines = statOut.split("\n").filter((l) => l.includes("|"));

        const skeleton = buildSkeleton({ branch, baseRef, commitSubjects, diffStatLines });
        if (skeleton.error) return errorResult(`refusing to create a PR from trunk branch '${branch}'`);

        return {
          content: [
            {
              type: "text",
              text: `branch=${skeleton.titleStub} base=${skeleton.baseRef} commits=${skeleton.commitSubjects.length} packages=${skeleton.fileGroups.length}`,
            },
          ] as TextContent[],
          details: { ...skeleton },
        };
      } catch (err) {
        return errorResult(err instanceof Error ? err.message : String(err));
      }
    },
  });
}

function errorResult(message: string) {
  return {
    content: [{ type: "text", text: `pr_skeleton: ${message}` }] as TextContent[],
    details: { error: message },
  };
}
