/**
 * jsdoc_doc_candidates — deterministic pre-filter for documentation work.
 *
 * Exports `collectCandidates` as a pure function (source text in, candidate
 * list out) so tests exercise it without touching the filesystem.
 * `registerJSDocCandidates` wires it into a Pi tool that reads the given
 * paths and returns only the exports that are worth writing JSDoc for.
 *
 * Skip rules (from skills/jsdoc-docs/SKILL.md):
 *   - simple get/set accessors
 *   - obvious one-liner wrappers (body spans ≤ 1 line)
 *   - names starting with an underscore
 *   - declared-boolean exports (internal state toggles)
 *   - test files (*.test.ts, *.spec.ts) unless includeTests
 */

import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { TextContent } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import ts from "typescript";

export interface DocCandidate {
  file: string;
  name: string;
  kind: "function" | "class" | "const" | "interface" | "type" | "enum";
  line: number;
  /** Why this is a candidate, e.g. "exported function" */
  reason: string;
}

export interface CollectResult {
  candidates: DocCandidate[];
  skipped: { file: string; reason: string }[];
}

function kindOf(node: ts.Node): DocCandidate["kind"] | null {
  if (ts.isFunctionDeclaration(node)) return "function";
  if (ts.isClassDeclaration(node)) return "class";
  if (ts.isEnumDeclaration(node)) return "enum";
  if (ts.isInterfaceDeclaration(node)) return "interface";
  if (ts.isTypeAliasDeclaration(node)) return "type";
  if (ts.isVariableStatement(node)) return "const";
  return null;
}

function hasExportModifier(node: ts.Node): boolean {
  const mods = (node as { modifiers?: readonly ts.ModifierLike[] }).modifiers;
  return Boolean(mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

/** Line span of a node, inclusive. */
function lineSpan(sourceFile: ts.SourceFile, node: ts.Node): number {
  const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line;
  const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd()).line;
  return end - start + 1;
}

/** Declared type annotation of a variable declaration, if any. */
function declaredTypeText(node: ts.VariableDeclaration): string | undefined {
  return node.type?.getText();
}

/**
 * Pure candidate selection: source text in, candidates out. No I/O.
 * Tested in tests/jsdoc-candidates.test.ts.
 */
export function collectCandidates(sourceText: string, fileName: string, includeTests: boolean): CollectResult {
  if (!/\.(ts|tsx)$/i.test(fileName)) {
    return { candidates: [], skipped: [{ file: fileName, reason: "not a .ts/.tsx file" }] };
  }
  if (!includeTests && /\.(test|spec)\.(ts|tsx)$/i.test(fileName)) {
    return { candidates: [], skipped: [{ file: fileName, reason: "test file (includeTests not set)" }] };
  }

  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const candidates: DocCandidate[] = [];

  for (const statement of sourceFile.statements) {
    const kind = kindOf(statement);
    if (!kind || !hasExportModifier(statement)) continue;

    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        const name = ts.isIdentifier(decl.name) ? decl.name.text : undefined;
        if (!name) continue;
        if (name.startsWith("_")) continue;
        if (declaredTypeText(decl) === "boolean") continue;
        candidates.push({
          file: fileName,
          name,
          kind,
          line: sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1,
          reason: "exported constant",
        });
      }
      continue;
    }

    const name = (statement as { name?: ts.Identifier }).name?.text;
    if (!name) continue;
    if (name.startsWith("_")) continue;

    // Accessors live inside class bodies; exported classes are candidates,
    // but a bare exported accessor declaration cannot exist at top level.
    if (ts.isFunctionDeclaration(statement)) {
      const body = statement.body;
      if (body && lineSpan(sourceFile, statement) <= 1) continue; // one-liner wrapper
      candidates.push({
        file: fileName,
        name,
        kind,
        line: sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1,
        reason: "exported function",
      });
      continue;
    }

    candidates.push({
      file: fileName,
      name,
      kind,
      line: sourceFile.getLineAndCharacterOfPosition(statement.getStart(sourceFile)).line + 1,
      reason: `exported ${kind}`,
    });
  }

  return { candidates, skipped: [] };
}

export function registerJSDocCandidates(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "jsdoc_doc_candidates",
    label: "jsdoc_doc_candidates",
    description:
      "Walk TypeScript files and return only the exported symbols worth writing " +
      "JSDoc for — skipping accessors, one-liners, test files, underscore names, " +
      "and boolean flags — so the model never reads code that needs no docs.",
    parameters: Type.Object({
      paths: Type.Array(Type.String({ description: "File path (relative or absolute)" }), {
        description: "TypeScript files to inspect",
      }),
      includeTests: Type.Optional(
        Type.Boolean({ description: "Include *.test.ts / *.spec.ts files (default: false)" }),
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { paths, includeTests = false } = params;
      const candidates: DocCandidate[] = [];
      const skipped: { file: string; reason: string }[] = [];

      for (const p of paths) {
        const file = p.startsWith("/") ? p : `${ctx.cwd}/${p}`;
        let source: string;
        try {
          source = await import("node:fs").then((fs) => fs.readFileSync(file, "utf8"));
        } catch {
          skipped.push({ file: p, reason: "unreadable" });
          continue;
        }
        const result = collectCandidates(source, p, includeTests);
        candidates.push(...result.candidates);
        skipped.push(...result.skipped);
      }

      return {
        content: [
          {
            type: "text",
            text: `${candidates.length} candidate(s) across ${paths.length} file(s); ${skipped.length} file(s) skipped.`,
          },
        ] as TextContent[],
        details: { candidates, skipped },
      };
    },
  });
}
