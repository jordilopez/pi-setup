---
name: git-create-pr
description: Prepare and create or update a pull request for the current branch with a concise description.
---

# Create a Pull Request

This skill composes the pull request title and description, then delegates the
push and the `gh` create/update step to the `git_create_pr` tool. The tool
shows the user a confirmation dialog and refuses to push unless they approve.
Do not use this skill on a trunk branch.

## 1. Check repository state

From the current repository root run:

```bash
git status --porcelain
git branch --show-current
git log --oneline --decorate -10
```

Stop if the current branch is a trunk branch (`main`, `master`, or
`develop`). If there are uncommitted changes, warn the user that only
committed work will be pushed and ask how to proceed (commit, stash, or
discard). Keep the repository-state results visible when presenting the PR
proposal.

## 2. Compose the PR description

Inspect the branch diff and commit subjects. Compose:

- a **title**: a concise summary of the change;
- a **description** with a short summary, implementation details grouped by
  area, tests and validation performed, and any relevant limitations or
  follow-up work.

For a trivial one-commit branch, a short description based on the commit is
sufficient. Pass the final text directly to the tool as arguments — do not
write it to a file.

## 3. Create or update the PR

Call the `git_create_pr` tool with the composed `title` and `body`. The tool:

- validates the current branch (refuses trunk branches and detached HEAD);
- resolves the base branch (`master`, then `main`) unless `base` is given;
- detects whether an open/draft PR already exists for the branch;
- asks the user to confirm the title, body, and base;
- pushes with `--force-with-lease` (setting upstream on first push) and runs
  `gh pr create` or `gh pr edit`.

The tool returns the PR URL, the action taken (`created`/`updated`), and
whether it pushed. Report the resulting URL and validation summary to the user.
Do not retry a failed call without user input.

Only pass `base` when the target is not the repository's `master`/`main`.
Pass `push: false` only when the branch is already pushed and should not be
force-updated.
