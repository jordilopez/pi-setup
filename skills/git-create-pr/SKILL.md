---
name: git-create-pr
description: Prepare and create or update a pull request for the current branch with a concise description.
---

# Create a Pull Request

This workflow prepares the PR in the active session and ends by invoking the
standalone `scripts/create-pr.sh` runner. It may push the branch,
so get user confirmation before running the final command. Do not use this skill
on a trunk branch.

## 1. Check repository state

From the current repository root run:

```bash
git status --porcelain
git branch --show-current
git log --oneline --decorate -10
```

Stop if the current branch is a trunk branch (`main`, `master`, or
`develop`) — the `/git:create-pr` extension rejects these. If there are
uncommitted changes, warn the user that only committed work will be pushed
and ask how to proceed (commit, stash, or discard). The extension itself
prompts for confirmation before pushing a dirty checkout, but it is clearer
to surface this upfront.

## 2. Write the PR description

Inspect the branch diff and commit subjects. Write `/tmp/pr-description.md` with:

- a concise summary;
- implementation details grouped by area;
- tests and validation performed;
- relevant limitations or follow-up work.

For a trivial one-commit branch, a short description based on the commit is
sufficient.

## 3. Confirm and create/update the PR

Show the user the proposed title and description. Ask for confirmation
before running:

```bash
bash scripts/create-pr.sh --yes /tmp/pr-description.md
```

Run this from the repository root. The script handles base-branch resolution,
branch-name validation, push, and PR creation or update without requiring a
Pi command session. `--yes` skips only the runner's dirty-checkout prompt;
it does **not** replace the user confirmation you obtained above. Direct
shell users can omit `--yes` to receive an interactive prompt. If a PR already
exists for this branch, the script updates it rather than creating a duplicate.
Report the resulting URL and test summary. If the script fails, report the
error and do not retry without user input.
