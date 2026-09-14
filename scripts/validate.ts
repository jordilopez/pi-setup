/**
 * Static validation for the pi setup package.
 *
 * Run with: `npm run validate` (or `node --experimental-strip-types scripts/validate.ts`).
 *
 * Checks skill frontmatter, agent frontmatter,
 * workflow metadata, expected package inventory, local skill references, and
 * the setup-only orchestration boundary. This stays dependency-free so it can
 * run before `npm install`.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { artifactBlocks, hasRepositorySkillPath, skillReferences } from "./validation-rules.ts";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const errors: string[] = [];
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const fail = (msg: string) => errors.push(msg);
const isDir = (path: string) => Boolean(statSync(path, { throwIfNoEntry: false })?.isDirectory());

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
const skillDir = join(ROOT, "skills");
const skillNames = new Set<string>();
if (!isDir(skillDir)) {
  fail("MISSING skills: skills/ is absent");
} else {
  for (const dir of readdirSync(skillDir).filter((entry) => !entry.startsWith("."))) {
    const skillFile = join(skillDir, dir, "SKILL.md");
    if (!statSync(skillFile, { throwIfNoEntry: false })?.isFile()) {
      fail(`SKILL ${dir}: missing SKILL.md`);
      continue;
    }
    const fm = frontmatter(skillFile);
    const skillErrors: string[] = [];
    if (fm.name !== dir) skillErrors.push(`name "${fm.name}" != directory`);
    if (!fm.description?.trim()) skillErrors.push("missing description");
    if (skillErrors.length) skillErrors.forEach((error) => fail(`SKILL ${dir}: ${error}`));
    else {
      ok(dir);
      skillNames.add(dir);
    }
  }
}

const KNOWN_TOOLS = new Set([
  "read",
  "write",
  "edit",
  "bash",
  "grep",
  "find",
  "cdp_connect",
  "cdp_disconnect",
  "cdp_goto",
  "cdp_query",
  "cdp_eval",
  "cdp_console",
  "cdp_screenshot",
  "cdp_back",
  "cdp_forward",
  "cdp_reload",
  "ask_user",
  "read_matching",
  "subagent",
  "delegate_subagent",
  "steer_subagent",
  "get_subagent_result",
  "wait_for_subagent_idle",
  "stop_subagent",
  "complete_subagent",
]);

console.log("\n=== Agents ===");
const agentDir = join(ROOT, "agents");
const agentFiles = statSync(agentDir, { throwIfNoEntry: false })?.isDirectory()
  ? readdirSync(agentDir)
      .filter((entry) => entry.endsWith(".md"))
      .sort()
  : [];
const agentNames = new Set(agentFiles.map((file) => file.replace(/\.md$/, "")));

for (const file of agentFiles) {
  const fm = frontmatter(join(ROOT, "agents", file));
  const agentErrors: string[] = [];
  const name = file.replace(/\.md$/, "");

  if (!Object.keys(fm).length) agentErrors.push("missing or malformed frontmatter");
  if (fm.name !== name) agentErrors.push(`name "${fm.name}" != filename`);
  if (!fm.description?.trim()) agentErrors.push("missing description");
  if (fm.model && !fm.model.trim()) agentErrors.push("empty model");
  if (fm["model-reasoning-effort"] && !["off", "low", "medium", "high"].includes(fm["model-reasoning-effort"])) {
    agentErrors.push(`invalid model-reasoning-effort "${fm["model-reasoning-effort"]}"`);
  }
  if (fm.pane && !["true", "false"].includes(fm.pane)) agentErrors.push(`invalid pane "${fm.pane}"`);
  for (const tool of (fm["deny-tools"] ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)) {
    if (!KNOWN_TOOLS.has(tool)) agentErrors.push(`unknown deny-tool "${tool}"`);
  }
  for (const sub of (fm["allowed-subagents"] ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)) {
    if (!agentNames.has(sub)) agentErrors.push(`unknown allowed-subagent "${sub}"`);
  }

  const agentBody = readFileSync(join(ROOT, "agents", file), "utf-8");
  if (hasRepositorySkillPath(agentBody)) {
    agentErrors.push("uses a repository-relative skill path; invoke skills by name");
  }
  for (const ref of skillReferences(agentBody)) {
    if (!skillNames.has(ref)) agentErrors.push(`unknown skill "${ref}" in /skill: reference`);
  }

  if (agentErrors.length) agentErrors.forEach((error) => fail(`AGENT ${file}: ${error}`));
  else ok(name);
}

const unique = new Set(agentFiles.map((f) => frontmatter(join(ROOT, "agents", f)).name));
if (unique.size !== agentFiles.length) fail("AGENT names are not unique");

console.log("\n=== Workflows ===");
const workflowDir = join(ROOT, "workflows");
const workflowFiles = statSync(workflowDir, { throwIfNoEntry: false })?.isDirectory()
  ? readdirSync(workflowDir)
      .filter((entry) => entry.endsWith(".md"))
      .sort()
  : [];

for (const file of workflowFiles) {
  const fm = frontmatter(join(ROOT, "workflows", file));
  const wfErrors: string[] = [];

  if (!Object.keys(fm).length) wfErrors.push("missing or malformed frontmatter");
  if (!fm.description?.trim()) wfErrors.push("missing description");
  if (!fm.agents?.trim()) wfErrors.push("missing agents metadata (comma-separated agent names)");

  const declared = (fm.agents ?? "")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  for (const agent of declared) {
    if (!agentNames.has(agent)) wfErrors.push(`references unknown agent "${agent}"`);
  }

  const workflowBody = readFileSync(join(ROOT, "workflows", file), "utf-8");
  if (hasRepositorySkillPath(workflowBody)) {
    wfErrors.push("uses a repository-relative skill path; invoke skills by name");
  }
  for (const ref of skillReferences(workflowBody)) {
    if (!skillNames.has(ref)) wfErrors.push(`unknown skill "${ref}" in /skill: reference`);
  }

  const expectedArtifacts: Record<string, string[]> = {
    "plan.md": ["tasks/plan.md", "tasks/todo.md"],
    "spec.md": ["SPEC.md"],
  };
  const requiredArtifacts = expectedArtifacts[file];
  if (requiredArtifacts) {
    const blocks = artifactBlocks(workflowBody);
    const actualPaths = blocks.map((block) => block.path);
    for (const path of requiredArtifacts) {
      const count = actualPaths.filter((actualPath) => actualPath === path).length;
      if (count !== 1) wfErrors.push(`requires exactly one artifact block for "${path}"`);
    }
    for (const path of actualPaths) {
      if (!requiredArtifacts.includes(path)) wfErrors.push(`unexpected artifact block for "${path}"`);
    }
    for (const block of blocks) {
      if (!block.content.trim()) wfErrors.push(`artifact block "${block.path}" is empty`);
    }
  }

  if (wfErrors.length) wfErrors.forEach((error) => fail(`WORKFLOW ${file}: ${error}`));
  else ok(file);
}

console.log("\n=== Inventory ===");
const EXPECTED = [
  ["settings.example.json", "settings"],
  ["AGENTS.md", "docs"],
  ["README.md", "docs"],
  ["LICENSE", "license"],
  ["package.json", "manifest"],
  ["scripts/setup.sh", "script"],
  ["scripts/validate.ts", "script"],
] as const;
for (const [path, kind] of EXPECTED) {
  if (!statSync(join(ROOT, path), { throwIfNoEntry: false })?.isFile()) {
    fail(`MISSING ${kind}: ${path}`);
  }
}
if (agentFiles.length === 0) fail("MISSING agents: agents/ is empty");
if (workflowFiles.length === 0) fail("MISSING workflows: workflows/ is empty");
if (!statSync(join(ROOT, "skills"), { throwIfNoEntry: false })?.isDirectory()) {
  fail("MISSING skills: skills/ is absent");
}
if (!errors.some((error) => error.startsWith("MISSING"))) {
  ok(
    `all ${EXPECTED.length} expected files present, ${agentFiles.length} agent(s), ${workflowFiles.length} workflow(s)`,
  );
}

console.log("\n=== References ===");
if (isDir(join(ROOT, "skills"))) {
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
}

console.log("\n=== Boundary ===");
const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8")) as Record<string, unknown>;
const dependencyFields = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"] as const;
const forbiddenDeps = ["@vanillagreen/pi-agents-tmux", "pi-graph"];
let boundaryErrors = 0;
for (const field of dependencyFields) {
  const deps = packageJson[field];
  if (!deps || typeof deps !== "object") continue;
  for (const name of Object.keys(deps as Record<string, unknown>)) {
    if (forbiddenDeps.includes(name)) {
      fail(`BOUNDARY package.json ${field} includes "${name}"; it must remain setup-only`);
      boundaryErrors++;
    }
  }
}
if (boundaryErrors === 0) ok("no orchestration packages in package dependencies");

console.log("\n=== Result ===");
if (errors.length) {
  for (const error of errors) console.error(`❌ ${error}`);
  console.error(`\n${errors.length} problem(s) found`);
  process.exit(1);
}
console.log("✅ all checks passed");
