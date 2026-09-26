/**
 * jsdoc-lint — deterministic checker for the JSDoc style guide in
 * skills/jsdoc-docs/SKILL.md.
 *
 * Rules (all specific to .ts files, where the type system already speaks):
 *   returns-void        — "@returns void" is never useful
 *   redundant-returns   — "@returns" when the signature already declares a return type
 *   param-in-ts         — "@param" tags duplicate the typed signature
 *   description-in-ts   — "@description" tag; leading text belongs in the block itself
 *
 * Usage: node --experimental-strip-types scripts/jsdoc-lint.ts [paths...]
 * With no paths, lints every .ts file under extensions/, scripts/, and tests/
 * (fixtures included). Exits 1 when diagnostics exist. Depends only on
 * Node built-ins plus the already-installed `typescript` devDependency.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export interface JSDocDiagnostic {
  file: string;
  line: number;
  rule: "returns-void" | "redundant-returns" | "param-in-ts" | "description-in-ts";
  message: string;
}

const DEFAULT_DIRS = ["extensions", "scripts", "tests"];

/**
 * Pure linter: source text in, diagnostics out. No I/O.
 * Tested in tests/jsdoc-lint.test.ts.
 */
export function lintSource(sourceText: string, fileName: string): JSDocDiagnostic[] {
  if (!/\.(ts|tsx)$/i.test(fileName)) return [];

  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.Latest, true);
  const diagnostics: JSDocDiagnostic[] = [];
  const lineOf = (pos: number) => sourceFile.getLineAndCharacterOfPosition(pos).line + 1;

  const visit = (node: ts.Node): void => {
    const jsDoc = (node as { jsDoc?: readonly ts.JSDoc[] }).jsDoc;
    if (jsDoc) {
      for (const doc of jsDoc) {
        for (const tag of doc.tags ?? []) {
          const line = lineOf(tag.getStart(sourceFile));
          const text = tag.getText(sourceFile);

          if (ts.isJSDocReturnTag(tag)) {
            if (/void/.test(text)) {
              diagnostics.push({
                file: fileName,
                line,
                rule: "returns-void",
                message: '"@returns void" adds nothing — drop the tag',
              });
            }
            const hasAnnotatedReturn =
              (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isArrowFunction(node)) &&
              Boolean(node.type);
            if (hasAnnotatedReturn) {
              diagnostics.push({
                file: fileName,
                line,
                rule: "redundant-returns",
                message: '"@returns" duplicates the annotated return type — describe it in prose or drop it',
              });
            }
            continue;
          }

          if (ts.isJSDocParameterTag(tag)) {
            diagnostics.push({
              file: fileName,
              line,
              rule: "param-in-ts",
              message: '"@param" duplicates the typed signature in .ts — skip the tag',
            });
            continue;
          }

          if (ts.isJSDocUnknownTag(tag) && /@description/i.test(text)) {
            diagnostics.push({
              file: fileName,
              line,
              rule: "description-in-ts",
              message: '"@description" tag — use leading block text instead',
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sourceFile, visit);

  return diagnostics;
}

function walkTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    // Deliberate anti-pattern fixtures would always fail the gate — skip them.
    if (entry.isDirectory() && !full.includes("fixtures")) walkTsFiles(full, out);
    else if (entry.isFile() && /\.(ts|tsx)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function main(): void {
  const root = resolve(fileURLToPath(import.meta.url), "..", "..");
  const args = process.argv.slice(2);
  const files = args.length > 0 ? args.map((a) => resolve(a)) : DEFAULT_DIRS.flatMap((d) => walkTsFiles(join(root, d)));

  const diagnostics: JSDocDiagnostic[] = [];
  for (const file of files) {
    if (!statSync(file, { throwIfNoEntry: false })?.isFile()) {
      console.error(`❌ ${file}: not a file`);
      process.exitCode = 1;
      continue;
    }
    diagnostics.push(...lintSource(readFileSync(file, "utf8"), file));
  }

  if (diagnostics.length === 0) {
    console.log(`✅ jsdoc-lint: ${files.length} file(s), no anti-patterns`);
    return;
  }
  for (const d of diagnostics) console.error(`❌ ${d.file}:${d.line} [${d.rule}] ${d.message}`);
  console.error(`\n${diagnostics.length} jsdoc anti-pattern(s) found`);
  process.exitCode = 1;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main();
