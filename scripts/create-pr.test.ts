import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";

import { createPr } from "./create-pr.ts";

const fixture = mkdtempSync(join(tmpdir(), "git-create-pr-test-"));
const bin = join(fixture, "bin");
const log = join(fixture, "commands.log");
const body = join(fixture, "summary.md");
mkdirSync(bin);
writeFileSync(body, "## Summary\n\nMultiline body\n");

writeFileSync(
  join(bin, "git"),
  `#!/usr/bin/env bash
set -eu
printf 'git %s\\n' "$*" >> ${JSON.stringify(log)}
case "$1" in
  merge-base) printf 'abc123\\n' ;;
  log) printf 'feat: example commit\\n' ;;
  *) printf '\\n' ;;
esac
`,
);
writeFileSync(
  join(bin, "gh"),
  `#!/usr/bin/env bash
set -eu
printf 'gh %s\\n' "$*" >> ${JSON.stringify(log)}
if [[ "\${GH_TEST_MODE:-create}" == "create" ]]; then
  case "$*" in
    *"pr view feature/test --json number,state"*) printf 'no pull requests found\\n' >&2; exit 1 ;;
    *"pr create"*) printf 'https://github.com/example/repo/pull/1\\n' ;;
  esac
else
  case "$*" in
    *"pr view feature/test --json number,state"*) printf '{"number":1,"state":"OPEN"}\\n' ;;
    *"pr view feature/test --json body"*) printf '{"body":"old body"}\\n' ;;
    *"pr view feature/test --json url"*) printf '{"url":"https://github.com/example/repo/pull/1"}\\n' ;;
  esac
fi
`,
);
chmodSync(join(bin, "git"), 0o755);
chmodSync(join(bin, "gh"), 0o755);

const originalPath = process.env.PATH;
process.env.PATH = `${bin}${delimiter}${originalPath ?? ""}`;
try {
  const created = createPr({ branchName: "feature/test", base: "main", summaryFile: "summary.md", cwd: fixture });
  assert.deepEqual(created, { action: "created", prUrl: "https://github.com/example/repo/pull/1" });
  assert.match(readFileSync(log, "utf8"), /gh pr create/);

  process.env.GH_TEST_MODE = "update";
  const updated = createPr({ branchName: "feature/test", base: "main", cwd: fixture });
  assert.deepEqual(updated, { action: "updated", prUrl: "https://github.com/example/repo/pull/1" });
  assert.match(readFileSync(log, "utf8"), /gh pr edit/);
} finally {
  process.env.PATH = originalPath;
  delete process.env.GH_TEST_MODE;
  rmSync(fixture, { recursive: true, force: true });
}

console.log("create-pr runner checks passed");
