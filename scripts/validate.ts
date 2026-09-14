/**
 * Static validation for the bootstrap-only pi-setup repository.
 *
 * Run with: `npm run validate`.
 * This intentionally uses only Node.js built-ins so it works before install.
 */

import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const errors: string[] = [];
const ok = (message: string) => console.log(`  ✓ ${message}`);
const fail = (message: string) => errors.push(message);
const exists = (path: string) => Boolean(statSync(path, { throwIfNoEntry: false }));
const isFile = (path: string) => Boolean(statSync(path, { throwIfNoEntry: false })?.isFile());

console.log("\n=== Setup inventory ===");
const requiredFiles = [
  "AGENTS.md",
  "README.md",
  "LICENSE",
  "package.json",
  "settings.example.json",
  "scripts/setup.sh",
  "scripts/validate.ts",
];
for (const relativePath of requiredFiles) {
  if (!isFile(join(ROOT, relativePath))) fail(`MISSING file: ${relativePath}`);
}
if (errors.length === 0) ok(`${requiredFiles.length} bootstrap files present`);

console.log("\n=== Resource directories ===");
for (const directory of ["skills", "extensions"]) {
  if (!exists(join(ROOT, directory))) {
    fail(`MISSING directory: ${directory}/`);
  }
}
if (!errors.some((error) => error.startsWith("MISSING directory"))) {
  ok("skills and extensions directories present");
}

console.log("\n=== Package manifest ===");
try {
  const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as Record<string, unknown>;
  if (packageJson.name !== "pi-setup") fail('package.json: name must be "pi-setup"');
  if (packageJson.private !== true) fail("package.json: setup package must remain private");
  if (packageJson.license !== "MIT") fail('package.json: license must be "MIT"');
  if (!("pi" in packageJson)) fail("package.json: must expose Pi resources (skills, extensions, etc.)");

  const scripts = packageJson.scripts;
  for (const script of ["validate", "format:check", "lint", "typecheck"]) {
    if (!scripts || typeof scripts !== "object" || !(script in scripts)) {
      fail(`package.json: missing ${script} script`);
    }
  }
  if (errors.filter((error) => error.startsWith("package.json:")).length === 0) {
    ok("bootstrap-only package manifest");
  }
} catch (error) {
  fail(`package.json: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
}

console.log("\n=== Installer contract ===");
try {
  const setup = readFileSync(join(ROOT, "scripts/setup.sh"), "utf8");
  if (!setup.includes("PI_AGENTS_TMUX_PACKAGE")) fail("scripts/setup.sh: missing PI_AGENTS_TMUX_PACKAGE");
  if (!setup.includes("PI_AGENT_SKILLS_PACKAGE")) fail("scripts/setup.sh: missing PI_AGENT_SKILLS_PACKAGE");
  if (!setup.includes('pi install "$REPO_ROOT"')) fail("scripts/setup.sh: pi-setup is not installed through pi");
  if (errors.filter((error) => error.startsWith("scripts/setup.sh:")).length === 0) {
    ok("installer covers orchestration, skills, and pi-setup");
  }
} catch (error) {
  fail(`scripts/setup.sh: cannot read file (${error instanceof Error ? error.message : String(error)})`);
}

console.log("\n=== Pi manifest paths ===");
try {
  const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as Record<string, unknown>;
  const pi = packageJson.pi as Record<string, string[]> | undefined;
  if (pi) {
    let allExist = true;
    for (const [type, paths] of Object.entries(pi)) {
      for (const relativePath of paths) {
        if (!exists(join(ROOT, relativePath))) {
          fail(`MISSING manifest path: pi.${type}: ${relativePath}`);
          allExist = false;
        }
      }
    }
    if (allExist) ok("all pi manifest paths exist on disk");
  }
} catch (error) {
  fail(`package.json: cannot re-read for manifest paths (${error instanceof Error ? error.message : String(error)})`);
}

console.log("\n=== Skill inventory ===");
try {
  const { readdirSync } = await import("node:fs");
  const skillsDir = join(ROOT, "skills");
  if (exists(skillsDir)) {
    const dirs = readdirSync(skillsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    let allMatch = true;
    for (const dir of dirs) {
      const skillMd = join(skillsDir, dir, "SKILL.md");
      if (!isFile(skillMd)) {
        fail(`MISSING skill: skills/${dir}/SKILL.md`);
        allMatch = false;
        continue;
      }
      const content = readFileSync(skillMd, "utf8");
      const nameMatch = content.match(/^name:\s*(.+)/m);
      if (nameMatch?.[1]?.trim() !== dir) {
        fail(
          `MISMATCH skills/${dir}/SKILL.md name=${JSON.stringify(nameMatch?.[1]?.trim() ?? "(missing)")} expected=${dir}`,
        );
        allMatch = false;
      }
    }
    if (allMatch) ok(`${dirs.length} skills, all names match directory`);
  }
} catch (error) {
  fail(`skills: cannot read inventory (${error instanceof Error ? error.message : String(error)})`);
}

console.log("\n=== Dependency boundary ===");
try {
  const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as Record<string, unknown>;
  const forbidden = ["@vanillagreen/pi-agents-tmux"];
  const deps = packageJson.dependencies as Record<string, string> | undefined;
  const violations = forbidden.filter((pkg) => deps && pkg in deps);
  if (violations.length > 0) {
    fail(`package.json: forbidden dependencies: ${violations.join(", ")}`);
  } else {
    ok("no forbidden packages in dependencies");
  }
} catch (error) {
  fail(`package.json: cannot re-read for boundary check (${error instanceof Error ? error.message : String(error)})`);
}

console.log("\n=== Result ===");
if (errors.length > 0) {
  for (const error of errors) console.error(`❌ ${error}`);
  console.error(`\n${errors.length} problem(s) found`);
  process.exit(1);
}
console.log("✅ all checks passed");
