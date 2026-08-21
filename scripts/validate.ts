/**
 * Static validation for the pi setup package.
 *
 * Run with: `npm run validate` (or `node --experimental-strip-types scripts/validate.ts`).
 *
 * Checks extension syntax/imports, skill frontmatter, expected package
 * inventory, and references to local skill files. This stays dependency-free
 * so it can run before `npm install`.
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const errors: string[] = [];
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string) => errors.push(msg);

function extensionFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) walk(full);
      else if (entry.endsWith(".ts")) out.push(full);
    }
  };
  walk(join(ROOT, "extensions"));
  return out;
}

function exportedNames(file: string): Set<string> {
  const src = readFileSync(file, "utf-8");
  const names = new Set<string>();
  for (const m of src.matchAll(
    /^export\s+(?:async\s+)?(?:function|const|class|interface|type|enum|default)\s+(\w+)/gm,
  )) {
    names.add(m[1]);
  }
  for (const m of src.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    for (const part of m[1].split(",")) {
      const trimmed = part.trim();
      if (!trimmed || trimmed.startsWith("type")) continue;
      const name = trimmed
        .split(/\s+as\s+/)
        .pop()!
        .trim();
      if (name) names.add(name);
    }
  }
  return names;
}

function resolveImport(fromFile: string, spec: string): string | null {
  const base = resolve(join(join(fromFile, ".."), spec));
  const candidates = [base.endsWith(".ts") ? base : base + ".ts", join(base, "index.ts")];
  return candidates.find((c) => statSync(c, { throwIfNoEntry: false })?.isFile()) ?? null;
}

console.log("\n=== Extensions ===");
for (const file of extensionFiles()) {
  const fileErrors: string[] = [];
  try {
    execFileSync(process.execPath, ["--experimental-strip-types", "--check", file], {
      stdio: "pipe",
    });
  } catch (e: any) {
    fileErrors.push(`SYNTAX: ${(e.stderr || e.message).toString().split("\n")[0]}`);
  }

  if (fileErrors.length === 0) {
    const src = readFileSync(file, "utf-8");
    for (const m of src.matchAll(/import\s*(?:type\s*)?\{([^}]+)\}\s*from\s*["'](\.[^"']+)["']/g)) {
      const names = m[1]
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("type "));
      const target = resolveImport(file, m[2]);
      if (!target) {
        fileErrors.push(`IMPORT: target not found: ${m[2]}`);
        continue;
      }
      const exported = exportedNames(target);
      for (const name of names) {
        if (!exported.has(name)) fileErrors.push(`IMPORT: "${name}" is not exported by ${m[2]}`);
      }
    }
    for (const m of src.matchAll(/import\s+(\w+)\s+from\s*["'](\.[^"']+)["']/g)) {
      const target = resolveImport(file, m[2]);
      if (target && !/^export\s+default/.test(readFileSync(target, "utf-8"))) {
        fileErrors.push(`IMPORT: default import "${m[1]}" but ${m[2]} has no export default`);
      }
    }
  }

  if (fileErrors.length) fileErrors.forEach((error) => fail(`${file}: ${error}`));
  else ok(file);
}

function frontmatter(file: string): Record<string, string> {
  const src = readFileSync(file, "utf-8");
  const match = src.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const out: Record<string, string> = {};
  const lines = match[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^(\w[\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2];
    if (value === ">" || value === "|-") {
      const body: string[] = [];
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1]) && lines[i + 1].trim()) {
        body.push(lines[++i].trim());
      }
      value = body.join(value === ">" ? " " : "\n");
    }
    out[kv[1]] = value;
  }
  return out;
}

console.log("\n=== Skills ===");
for (const dir of readdirSync(join(ROOT, "skills")).filter((entry) => !entry.startsWith("."))) {
  const skillFile = join(ROOT, "skills", dir, "SKILL.md");
  if (!statSync(skillFile, { throwIfNoEntry: false })?.isFile()) {
    fail(`SKILL ${dir}: missing SKILL.md`);
    continue;
  }
  const fm = frontmatter(skillFile);
  const skillErrors: string[] = [];
  if (fm.name !== dir) skillErrors.push(`name "${fm.name}" != directory`);
  if (!fm.description?.trim()) skillErrors.push("missing description");
  if (skillErrors.length) skillErrors.forEach((error) => fail(`SKILL ${dir}: ${error}`));
  else ok(dir);
}

console.log("\n=== Inventory ===");
const EXPECTED = [
  ["extensions/read-matching.ts", "extension"],
  ["extensions/redact/index.ts", "extension"],
  ["extensions/cdp/index.ts", "extension"],
  ["extensions/git/index.ts", "extension"],
  ["settings.example.json", "settings"],
  ["AGENTS.md", "docs"],
  ["LICENSE", "license"],
] as const;
for (const [path, kind] of EXPECTED) {
  if (!statSync(join(ROOT, path), { throwIfNoEntry: false })?.isFile()) {
    fail(`MISSING ${kind}: ${path}`);
  }
}
if (!errors.some((error) => error.startsWith("MISSING"))) {
  ok(`all ${EXPECTED.length} expected files present`);
}

console.log("\n=== References ===");
const skillFiles = new Set<string>();
for (const dir of readdirSync(join(ROOT, "skills"))) {
  if (dir.startsWith(".")) continue;
  skillFiles.add(`skills/${dir}/SKILL.md`);
  const sub = join(ROOT, "skills", dir);
  for (const entry of readdirSync(sub)) {
    if (entry.endsWith(".md") && entry !== "SKILL.md") skillFiles.add(`skills/${dir}/${entry}`);
  }
}

let refErrors = 0;
for (const dir of readdirSync(join(ROOT, "skills")).filter((entry) => !entry.startsWith("."))) {
  for (const file of readdirSync(join(ROOT, "skills", dir)).filter((entry) => entry.endsWith(".md"))) {
    const content = readFileSync(join(ROOT, "skills", dir, file), "utf-8");
    for (const m of content.matchAll(/\$\{PI_MY_SETUP[^}]*\}\/skills\/([\w./-]+\.md)/g)) {
      const rel = `skills/${m[1]}`;
      if (!skillFiles.has(rel)) {
        fail(`REF skills/${dir}/${file}: unknown skill path ${rel}`);
        refErrors++;
      }
    }
  }
}
if (refErrors === 0) ok("all local skill references resolve");

console.log("\n=== Result ===");
if (errors.length) {
  for (const error of errors) console.error(`❌ ${error}`);
  console.error(`\n${errors.length} problem(s) found`);
  process.exit(1);
}
console.log("✅ all checks passed");
