import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { artifactBlocks, hasRepositorySkillPath, skillReferences } from "./validation-rules.ts";

const ROOT = join(import.meta.dirname, "..");

const pathCases: Array<[string, boolean]> = [
  ["skills/foo/SKILL.md", true],
  ["../../skills/foo/SKILL.md", true],
  ["src/skills/foo/SKILL.md", true],
  ["docs\\skills\\foo\\SKILL.md", true],
  ["my-skills/foo", false],
  ["ordinary skills prose", false],
];

for (const [value, expected] of pathCases) {
  assert.equal(hasRepositorySkillPath(value), expected, `skill path case: ${value}`);
}

assert.deepEqual(skillReferences("/skill:test-driven-development /skill:custom"), [
  "test-driven-development",
  "custom",
]);

const plan = readFileSync(join(ROOT, "workflows/plan.md"), "utf8");
assert.deepEqual(
  artifactBlocks(plan).map((block) => block.path),
  ["tasks/plan.md", "tasks/todo.md"],
);

const spec = readFileSync(join(ROOT, "workflows/spec.md"), "utf8");
assert.deepEqual(
  artifactBlocks(spec).map((block) => block.path),
  ["SPEC.md"],
);

assert.deepEqual(artifactBlocks("no artifact block"), []);
assert.equal(artifactBlocks("```text:path=SPEC.md\nfirst\n```\n```text:path=SPEC.md\nsecond\n```").length, 2);
assert.deepEqual(artifactBlocks("```text:path=unexpected.md\ncontent\n```"), [
  { path: "unexpected.md", content: "content\n" },
]);
assert.deepEqual(artifactBlocks("```text:path=SPEC.md\n\n```"), [{ path: "SPEC.md", content: "\n" }]);

console.log("validation rule and artifact handoff checks passed");
