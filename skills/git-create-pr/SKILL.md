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
  "")
    echo "Not on a branch (detached HEAD?) — aborting" >&2
    exit 1
    ;;
  main|master|develop)
    echo "Refusing to create a PR from trunk branch '$branch'" >&2
    exit 1
    ;;
esac

if ! git check-ref-format --branch "$branch" >/dev/null 2>&1; then
  echo "Unsafe branch name: '$branch'" >&2
  exit 1
fi

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
  git push --force-with-lease
else
  git push --force-with-lease --set-upstream "$remote" HEAD
fi

view_output="$(mktemp)"
view_error="$(mktemp)"
cleanup() {
  rm -f "$view_output" "$view_error"
}
trap cleanup EXIT

pr_state=""
if gh pr view "$branch" --json state --jq '.state' >"$view_output" 2>"$view_error"; then
  pr_state="$(<"$view_output")"
  case "$pr_state" in
    OPEN|DRAFT)
      gh pr edit "$branch" \
        --title "$branch" \
        --body-file /tmp/pr-description.md
      ;;
    MERGED|CLOSED)
      gh pr create \
        --base "$base" \
        --head "$branch" \
        --title "$branch" \
        --body-file /tmp/pr-description.md
      ;;
    *)
      echo "Unexpected PR state from gh pr view; refusing to continue." >&2
      exit 1
      ;;
  esac
else
  gh_status=$?
  gh_error="$(<"$view_error")"
  gh_error_lower="${gh_error,,}"
  if [[ "$gh_status" -eq 1 && "$gh_error_lower" =~ no[[:space:]]+pull[[:space:]]+requests? ]]; then
    gh pr create \
      --base "$base" \
      --head "$branch" \
      --title "$branch" \
      --body-file /tmp/pr-description.md
  else
    echo "gh pr view failed (status $gh_status); refusing to continue." >&2
    exit "$gh_status"
  fi
fi
```

The flow validates the branch with `git check-ref-format --branch`, refuses
trunk branches, prefers local `master` and falls back to local `main`, and
detects the first push versus an existing upstream. Existing upstreams use
`git push --force-with-lease`; first pushes use
`git push --force-with-lease --set-upstream "$remote" HEAD`.

The branch name is used as the PR title and `/tmp/pr-description.md` is always
the PR body. An open or draft PR is updated; a merged or closed PR is replaced
with a new PR. `gh pr view` is treated as “no matching PR” only when it exits
with status 1 and reports a “no pull requests” condition; authentication,
network, malformed-state, and other failures stop the flow. Report the
resulting URL and validation summary. If any command fails, report the error
and do not retry without user input.
