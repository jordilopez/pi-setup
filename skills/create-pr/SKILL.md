---
name: create-pr
description: Prepare and create or update a pull request for the current branch with a concise description.
---

# Create a Pull Request

This workflow runs in the active Pi session and ends by invoking
`/git:create-pr`. It may push the branch, so get user confirmation before
running the final command. Do not use this skill on a trunk branch.

## 1. Check repository state

From the current repository root run:

```bash
git status --porcelain
git branch --show-current
git log --oneline --decorate -10
```

Stop if there are uncommitted changes or if the current branch is
`main`, `master`, or `develop`. Ask the user how to resolve unexpected changes
instead of stashing or discarding them automatically.

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

```text
/git:create-pr /tmp/pr-description.md
```

That command handles base-branch resolution, branch-name validation, push,
and PR creation or update. Report the resulting URL and test summary. If the
command fails, report the error and do not retry without user input.
