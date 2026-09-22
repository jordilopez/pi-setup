---
name: github-branch-protection
description: Apply or audit a generic GitHub branch-protection policy to one or more repositories via the `gh` CLI. Use when the user wants to configure branch protection (require PRs, set approval count, code-owner reviews, admin enforcement, block force-push/deletion, required status checks) across repositories, or convert an ad-hoc protection change into a repeatable workflow.
---

# GitHub Branch Protection

Apply a declarative branch-protection policy to any GitHub repository (or a
batch of them) using the `gh` CLI and the legacy branch-protection REST
endpoint. This skill is repository- and org-agnostic: it derives the
`owner/repo` slug from each repo's `origin` remote, audits the current state,
shows the diff, asks for confirmation, then applies and verifies.

> **This is a remote, mutating operation.** Never run the apply step without
> explicit user confirmation of the exact repositories, branch, and policy.

## Prerequisites

- `gh` installed and authenticated with admin scope on the target repos:

  ```bash
  gh auth status
  ```

- The caller must be a repository **admin** for the protected branch — the
  legacy protection API rejects the write otherwise.
- The target branch must exist on the remote (`main` is the common default but
  the skill takes the branch as a parameter).

## Inputs to collect before doing anything

1. **Repos** — either explicit `owner/repo` slugs, or local directories whose
   `origin` remote you resolve to a slug:

   ```bash
   git -C <dir> remote get-url origin \
     | sed -E 's#.*github\.com[:/]([^/]+/[^/.]+)(\.git)?#\1#'
   ```

2. **Branch** — the branch to protect (e.g. `main`).
3. **Policy** — one of the presets below, or a custom set of toggles.
4. **Status checks** — whether any CI checks must pass before merge. This is
   the one input that must exactly match the check names GitHub publishes;
   never guess them. If the user wants status checks, discover them first (see
   "Required status checks") and confirm the exact strings.

## Policy presets

Encode the policy as JSON for the protection endpoint. Field semantics:

- `required_pull_request_reviews.required_approving_review_count` — `0` means
  "require a PR but no approval" (solo-maintainer friendly).
- `required_status_checks` — `null` disables status-check gating.
- `enforce_admins` — `true` means admins are subject to the rules too.
- `allow_force_pushes` / `allow_deletions` — `false` blocks both.

### Preset `solo-pr-no-approval` (default)

The model for a single maintainer who allows outside contributors to open PRs
but only merge themselves:

```json
{
  "required_status_checks": null,
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0
  },
  "restrictions": null
}
```

Result: PR required (no direct push), 0 approvals (author can self-merge),
no code-owner gate, admins enforced, force-push and deletion blocked, no CI
gate.

### Preset `review-gated`

For a team where changes need an approving review:

```json
{
  "required_status_checks": null,
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null
}
```

> If `require_code_owner_reviews` is set to `true`, the repository **must**
> have a `.github/CODEOWNERS` file that resolves a non-empty owner for the
> protected paths, otherwise PRs become unmergeable. Only enable it when the
> user confirms CODEOWNERS exists.

### Custom policy

When the user names specific toggles (e.g. "also require linear history",
"keep force-push blocked but leave admins unenforced"), start from the closest
preset and set the requested fields. Relevant top-level fields beyond the
presets: `required_linear_history`, `required_conversation_resolution`,
`required_signatures` (commits must be signed), `lock_branch`,
`block_creations`, `allow_fork_syncing`. Each is a boolean in a
`{ "enabled": <bool> }` shape on read, but on write you pass the boolean
directly at the top level. If unsure of a field, audit first (see step 1) and
mirror the read shape.

## Workflow

### 1. Audit current state (read-only, always do this first)

For every resolved `owner/repo` and the target branch:

```bash
gh api "repos/<owner/repo>/branches/<branch>/protection" \
  --jq '{
    approvals: (.required_pull_request_reviews.required_approving_review_count // "none"),
    codeOwners: (.required_pull_request_reviews.require_code_owner_reviews // "n/a"),
    admins: .enforce_admins.enabled,
    forcePush: .allow_force_pushes.enabled,
    deletions: .allow_deletions.enabled,
    statusChecks: (.required_status_checks.contexts // null)
  }'
```

A confirmed `404` for a branch with no protection means protection is not
configured — treat the current policy as "none" in the diff. Do not interpret a
`403` as unconfigured: report it as an authorization or access error and stop
before proposing or applying changes.

### 2. Show the diff and confirm

Present a table: policy field → current → proposed, per repo. Call out side
effects the user may not expect:

- Setting `required_approving_review_count` to a value `>= 1` blocks a solo
  author from self-merging (GitHub does not count author self-approval).
- `enforce_admins: true` applies the rules to admins — a maintainer who was
  used to pushing straight to the branch will be blocked.
- Enabling `require_code_owner_reviews` without CODEOWNERS breaks merges.

Ask for explicit confirmation of the exact repos, branch, and policy before
any write.

### 3. Apply

Pipe the confirmed policy JSON via `--input -` (avoids shell-quoting issues
and leaves no temp file):

```bash
gh api -X PUT "repos/<owner/repo>/branches/<branch>/protection" --input - <<'JSON'
<confirmed policy JSON>
JSON
```

Run one repo at a time and check each response. If any call fails (e.g. missing
admin rights, branch not found), stop and report that repo's error — do not
silently skip or retry.

### 4. Verify

Re-run the audit query from step 1 and confirm each repo matches the proposed
policy. Report the final per-repo result.

## Required status checks

Never hard-code CI check names. Before adding `required_status_checks` to a
policy, discover the checks the repo actually publishes:

```bash
# Recent check runs / their names
gh api "repos/<owner/repo>/commits/<branch>/check-runs" \
  --jq '.check_runs[].name' | sort -u

# Or list what a merged/open PR shows
gh pr list --repo "<owner/repo>" --state all --limit 1 \
  --json headRefOid --jq '.[0].headRefOid' \
  | xargs -I{} gh api "repos/<owner/repo>/commits/{}/check-runs" \
      --jq '.check_runs[].name' | sort -u
```

Then set, using exact strings:

```json
"required_status_checks": {
  "strict": true,
  "contexts": ["ci/lint-css", "ci/check-tokens", "build"]
}
```

Confirm the resolved context strings with the user before writing; a context
that never reports makes the branch permanently unmergeable.

## Safety rules

- **Confirm before every write.** Batch operations amplify mistakes — list the
  exact repos and branch that will change.
- **Audit before you assume.** Report the real current state; do not infer it
  from memory of a prior session.
- **Idempotent.** Applying the same policy twice is harmless; the PUT sets the
  full desired state, so this is safe to re-run.
- **Legacy API caveat.** This skill uses the classic branch-protection
  endpoint. If a repo is configured with the newer **rulesets** API instead,
  the branch-protection endpoint will not reflect those rules — check with
  `gh api "repos/<owner/repo>/rulesets"` and warn the user if rulesets exist.
- **No secrets.** Do not print `gh auth token` or any credential; use
  `gh auth status` for readiness checks only.
