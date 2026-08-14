/**
 * Static validation for the pi setup package.
 *
 * Run with: `npm run validate` (or `node --experimental-strip-types scripts/validate.ts`)
 *
 * Checks (dependency-free — no pi packages needed):
 * 1. Every extension .ts file parses (node --experimental-strip-types --check)
 * 2. Relative imports resolve and every named import is actually exported
 *    by the target module (catches the common.ts export bug class)
 * 3. Agent frontmatter: name matches filename, model is one of the documented
 *    opencode-go models, description present, model-reasoning-effort (if set)
 *    is valid, deny-tools are known
 * 4. Skill frontmatter: name matches directory, description present
 * 5. Prompt frontmatter: description present
 * 6. Inventory: prompts/ and loose extensions exist
 * 7. References: agent names and ${PI_MY_SETUP}/skills/... paths used in
 *    skills/ and prompts/ resolve to real files (no stale tester/scout)
 */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");

// Documented model policy — keep in sync with AGENTS.md / README
const KNOWN_MODELS = new Set([
  "opencode-go/gpt-5.6-luna",
  "opencode-go/deepseek-v4-flash",
]);

const KNOWN_THINKING = new Set(["off", "minimal", "low", "medium", "high", "xhigh", "max"]);

// pi built-ins + tools registered by this package's extensions
const KNOWN_TOOLS = new Set([
  "read", "read_matching", "bash", "edit", "write", "grep", "find", "ls", "subagent",
  "delegate_subagent",
  "cdp_connect", "cdp_disconnect", "cdp_goto", "cdp_query", "cdp_eval", "cdp_screenshot",
  "cdp_back", "cdp_forward", "cdp_reload", "cdp_console",
]);

const errors: string[] = [];
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string) => errors.push(msg);

// ─── 1. extension file discovery ──────────────────────────────────────────
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

// ─── 2. exported names of a module ────────────────────────────────────────
function exportedNames(file: string): Set<string> {
  const src = readFileSync(file, "utf-8");
  const names = new Set<string>();
  for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:function|const|class|interface|type|enum|default)\s+(\w+)/gm)) {
    names.add(m[1]);
  }
  // export { a, b as c } — record the exported alias (b as c → c)
  for (const m of src.matchAll(/^export\s*\{([^}]+)\}/gm)) {
    for (const part of m[1].split(",")) {
      const trimmed = part.trim();
      if (!trimmed || trimmed.startsWith("type")) continue;
      const name = trimmed.split(/\s+as\s+/).pop()!.trim();
      if (name) names.add(name);
    }
  }
  return names;
}

/** Resolve a relative import specifier to a file, trying .ts / index.ts variants. */
function resolveImport(fromFile: string, spec: string): string | null {
  const base = resolve(join(join(fromFile, ".."), spec));
  const candidates = [
    base.endsWith(".ts") ? base : base + ".ts",
    join(base, "index.ts"),
  ];
  return candidates.find((c) => statSync(c, { throwIfNoEntry: false })?.isFile()) ?? null;
}

// ─── 3. per-file checks ───────────────────────────────────────────────────
console.log("\n=== Extensions ===");
for (const file of extensionFiles()) {
  const rel = resolve(ROOT, file);
  const fileErrors: string[] = [];
  // 3a. syntax
  try {
    execFileSync(process.execPath, ["--experimental-strip-types", "--check", file], {
      stdio: "pipe",
    });
  } catch (e: any) {
    fileErrors.push(`SYNTAX: ${(e.stderr || e.message).toString().split("\n")[0]}`);
  }

  if (fileErrors.length === 0) {
    // 3b. relative imports resolve + named imports are exported
    const src = readFileSync(file, "utf-8");
    for (const m of src.matchAll(/import\s*(?:type\s*)?\{([^}]+)\}\s*from\s*["'](\.[^"']+)["']/g)) {
      const names = m[1].split(",").map((s) => s.trim()).filter((s) => s && !s.startsWith("type "));
      const target = resolveImport(file, m[2]);
      if (!target) {
        fileErrors.push(`IMPORT: target not found: ${m[2]}`);
        continue;
      }
      const exported = exportedNames(target);
      for (const name of names) {
        if (!exported.has(name)) {
          fileErrors.push(`IMPORT: "${name}" is not exported by ${m[2]}`);
        }
      }
    }
    // default imports (import X from "./y")
    for (const m of src.matchAll(/import\s+(\w+)\s+from\s*["'](\.[^"']+)["']/g)) {
      const target = resolveImport(file, m[2]);
      if (target && !/^export\s+default/.test(readFileSync(target, "utf-8"))) {
        fileErrors.push(`IMPORT: default import "${m[1]}" but ${m[2]} has no export default`);
      }
    }
  }

  if (fileErrors.length) fileErrors.forEach((e) => fail(`${rel}: ${e}`));
  else ok(rel);
}

// ─── 4. agent + skill frontmatter ─────────────────────────────────────────
function frontmatter(file: string): Record<string, string> {
  const src = readFileSync(file, "utf-8");
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  const out: Record<string, string> = {};
  const lines = m[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const kv = lines[i].match(/^([\w-]+):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2];
    // folded value (description: >) — collect indented continuation lines
    if (value === ">") {
      const body: string[] = [];
      while (i + 1 < lines.length && /^\s+/.test(lines[i + 1]) && lines[i + 1].trim()) {
        body.push(lines[i + 1].trim());
        i++;
      }
      value = body.join(" ");
    }
    out[kv[1]] = value;
  }
  return out;
}

console.log("\n=== Agents ===");
for (const file of readdirSync(join(ROOT, "agents")).filter((f) => f.endsWith(".md") && !f.startsWith("."))) {
  const fm = frontmatter(join(ROOT, "agents", file));
  const name = file.replace(/\.md$/, "");
  const fileErrors: string[] = [];
  if (fm.name !== name) fileErrors.push(`name "${fm.name}" != filename`);
  if (!fm.model) fileErrors.push("missing model");
  else if (!KNOWN_MODELS.has(fm.model)) fileErrors.push(`unknown model "${fm.model}"`);
  if (!fm.description) fileErrors.push("missing description");
  if (fm["model-reasoning-effort"] && !KNOWN_THINKING.has(fm["model-reasoning-effort"])) {
    fileErrors.push(`unknown model-reasoning-effort "${fm["model-reasoning-effort"]}"`);
  }

  const denyTools = (fm["deny-tools"] || "").split(",").map((t) => t.trim()).filter(Boolean);
  for (const tool of denyTools) {
    if (!KNOWN_TOOLS.has(tool)) fileErrors.push(`unknown denied tool "${tool}"`);
  }
  // Read-only agents must deny write/edit tools (write/edit vs description).
  // Agents claiming read-only / never-modifies behavior must not carry write
  // or edit capability.
  const claimsReadOnly = /read-only|never modifies files/i.test(fm.description || "");
  if (claimsReadOnly && !(denyTools.includes("write") || denyTools.includes("edit"))) {
    fileErrors.push(`read-only description but write/edit not denied`);
  }

  if (fileErrors.length) fileErrors.forEach((e) => fail(`AGENT ${file}: ${e}`));
  else ok(file);
}

console.log("\n=== Skills ===");
for (const dir of readdirSync(join(ROOT, "skills")).filter((d) => !d.startsWith("."))) {
  const skillFile = join(ROOT, "skills", dir, "SKILL.md");
  if (!statSync(skillFile, { throwIfNoEntry: false })?.isFile()) {
    fail(`SKILL ${dir}: missing SKILL.md`);
    continue;
  }
  const fm = frontmatter(skillFile);
  if (fm.name !== dir) fail(`SKILL ${dir}: name "${fm.name}" != directory`);
  if (!fm.description || !fm.description.trim()) fail(`SKILL ${dir}: missing description`);
  ok(dir);
}

console.log("\n=== Prompts ===");
for (const file of readdirSync(join(ROOT, "prompts")).filter((f) => f.endsWith(".md") && !f.startsWith("."))) {
  const fm = frontmatter(join(ROOT, "prompts", file));
  if (!fm.description || !fm.description.trim()) fail(`PROMPT ${file}: missing description`);
  ok(file);
}

// ─── 5. inventory ─────────────────────────────────────────────────────────
console.log("\n=== Inventory ===");
const EXPECTED = [
  ["prompts/implement.md", "prompt"],
  ["prompts/scout-and-plan.md", "prompt"],
  ["prompts/implement-and-review.md", "prompt"],
  ["prompts/review-and-commit.md", "prompt"],
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
if (!errors.some((e) => e.startsWith("MISSING"))) {
  ok(`all ${EXPECTED.length} expected files present`);
}

// ─── 6. reference validation (agents + skill paths) ───────────────────────
console.log("\n=== References ===");
const agentNames = new Set(readdirSync(join(ROOT, "agents")).map((f) => f.replace(/\.md$/, "")));
const skillFiles = new Set<string>();
for (const dir of readdirSync(join(ROOT, "skills"))) {
  if (dir.startsWith(".")) continue;
  skillFiles.add(`skills/${dir}/SKILL.md`);
  const sub = join(ROOT, "skills", dir);
  for (const entry of readdirSync(sub)) {
    if (entry.endsWith(".md") && entry !== "SKILL.md") skillFiles.add(`skills/${dir}/${entry}`);
  }
}

const scanDirs = [
  ...readdirSync(join(ROOT, "skills")).filter((d) => !d.startsWith(".")).map((d) => `skills/${d}`),
  "prompts",
];
let refErrors = 0;
for (const dir of scanDirs) {
  for (const file of readdirSync(join(ROOT, dir)).filter((f) => f.endsWith(".md"))) {
    const content = readFileSync(join(ROOT, dir, file), "utf-8");
    // agent="name" references
    for (const m of content.matchAll(/agent="([\w-]+)"/g)) {
      if (!agentNames.has(m[1])) {
        fail(`REF ${dir}/${file}: unknown agent "${m[1]}"`);
        refErrors++;
      }
    }
    // ${PI_MY_SETUP...}/skills/... paths
    for (const m of content.matchAll(/\$\{PI_MY_SETUP[^}]*\}\/skills\/([\w./-]+\.md)/g)) {
      const rel = `skills/${m[1]}`;
      if (!skillFiles.has(rel)) {
        fail(`REF ${dir}/${file}: unknown skill path ${rel}`);
        refErrors++;
      }
    }
  }
}
if (refErrors === 0) ok("all agent + skill references resolve");

// ─── summary ──────────────────────────────────────────────────────────────
console.log("\n=== Result ===");
if (errors.length) {
  for (const e of errors) console.error(`❌ ${e}`);
  console.error(`\n${errors.length} problem(s) found`);
  process.exit(1);
}
console.log("✅ all checks passed");
