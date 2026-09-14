---
name: git-create-pr
description: Prepare and create or update a pull request for the current branch with a concise description.
---

# Create a Pull Request

This workflow prepares the PR in the active session and finishes by running
`git` and `gh` directly through bash. It may push the branch, so get explicit
user confirmation before running the final command block. Do not use this skill
on a trunk branch.

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

## 2. Write the PR description

Inspect the branch diff and commit subjects. Write `/tmp/pr-description.md`
with:

- a concise summary;
- implementation details grouped by area;
- tests and validation performed;
- relevant limitations or follow-up work.

For a trivial one-commit branch, a short description based on the commit is
sufficient.

## 3. Confirm and create/update the PR

Show the user the proposed title (the current branch name) and the complete
contents of `/tmp/pr-description.md`. Ask for explicit confirmation before
running the following bash flow. Do not execute it before the user confirms.

```bash
set -euo pipefail

branch="$(git branch --show-current)"
case "$branch" in
  "" )
    echo "Not on a branch (detached HEAD?) — aborting" >&2
    exit 1
    ;;
  main|master|develop)
    echo "Refusing to create a PR from trunk branch '$branch'" >&2
    exit 1
    ;;
esac

base=""
if git show-ref --verify --quiet refs/heads/master; then
  base=master
elif git show-ref --verify --quiet refs/heads/main; then
  base=main
else
  echo 'No `master` or `main` branch found — aborting' >&2
  exit 1
fi

remote="$(git remote | awk 'NF { print; exit }')"
remote="${remote:-origin}"
if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  git push
else
  git push --set-upstream "$remote" HEAD
fi

pr_state="$(gh pr view "$branch" --json state --jq '.state' 2>/dev/null || true)"
case "$pr_state" in
  OPEN|DRAFT)
    gh pr edit "$branch" \
      --title "$branch" \
      --body-file /tmp/pr-description.md
    ;;
  MERGED|CLOSED|"")
    gh pr create \
      --base "$base" \
      --head "$branch" \
      --title "$branch" \
      --body-file /tmp/pr-description.md
    ;;
  *)
    echo "Unexpected PR state: $pr_state" >&2
    exit 1
    ;;
esac
```

The flow refuses trunk branches, prefers local `master` and falls back to
local `main`, detects the first push versus an existing upstream, and uses the
branch name as the PR title. If an open or draft PR exists, it is updated;
otherwise a new PR is created. Report the resulting URL and validation summary.
If any command fails, report the error and do not retry without user input.
