---
name: commit-full
description: Analyze changes, clean up (strip console.logs, add JSDoc/comments, a11y checks), add tests, and commit. Never pushes to remote.
---

# Commit Full Skill

Intelligently prepares code changes for a high-quality commit, then commits locally. **Never pushes to remote** — this workflow ends at local commits.

## Steps

### 1. Analyze Changes

Run `git diff --staged` (or `git diff` if nothing is staged) to inspect changes. Then **unstage everything** (`git restore --staged .`) so the working tree is cleanly separated from staging.

#### Baseline snapshot (before any agent edits)

The tree you start from already contains your own pre-existing work, and the
steps below add agent-generated edits on top (cleanup, tests). Before staging
or delegating anything, snapshot that starting state so an abort can never
destroy your work:

```bash
git diff > /tmp/commit-full-baseline.diff        # tracked-file changes (empty if clean)
git status --short > /tmp/commit-full-baseline.status  # includes untracked files
```

Keep both files until the workflow finishes. **Never** discard agent changes
with an unscoped `git clean -fd` or a whole-file `git checkout -- <file>` —
those restore from the index/HEAD and delete untracked files, which would
destroy your pre-existing uncommitted work. Agent edits are always removed
hunk-wise (see steps 5 and 9) or restored from this snapshot.

Decide between **single** or **multiple** commits.

#### Decision checklist

| Signal | Action |
|--------|--------|
| Single area, same type, same functional area, cohesive | Single commit |
| Multiple areas touched | Split |
| Multiple commit types mixed (feat + refactor, fix + style, etc.) | Split |
| Different functional areas in the same area | Consider splitting |
| N > ~15 files | Look for sub-groups, likely split |
| Code cleanup + new behavior mixed | Split |
| File changed for multiple unrelated reasons | Split |

> ⚠️ **Do not skip this step.** Every commit should be logically coherent and independently revertable.
> If you find yourself rushing past the split analysis, stop and force yourself to make the call.
> A "single commit that covers everything" is almost always a sign you skipped the analysis.
> When in doubt, **split** — smaller commits are easier to review, revert, and cherry-pick.

If still unsure, **prefer multiple commits** — smaller commits are easier to review and revert.

### 2. Define Commit Groups

If you decided on **multiple commits** in step 1, explicitly define the groups here. Each group is a list of files that form one logical, independently-revertable commit.

#### How to define groups

Group files by:
- **Area** (e.g., all `extensions/` changes, all `agents/` changes)
- **Commit type** (e.g., `feat` changes in one commit, `refactor` in another)
- **Functional area** (e.g., auth changes, docs changes)
- **Foundation order**: fixes before features, refactors before new code

For each group, record:
- **Files**: the exact file paths in the group
- **Type**: the conventional commit type (`feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `style`)
- **Scope**: the area (e.g., `extensions`, `agents`, `prompts`)
- **Summary**: a short `<type>(<scope>): <summary>` line (or placeholder to refine later)

#### Single commit is one group

If you decided on a **single commit**, define exactly one group containing all changed files.

> ⚠️ **Do not skip defining groups.** Even a single commit gets one group defined — this keeps the flow uniform and prevents skipping the planning step.

### 3. Present Grouping Plan

Use `ask_user` to show the proposed commit groups and get user sign-off before proceeding:

> "Here's the proposed commit plan:"
> - Group 1: `fix(extensions): correct redaction caching` — 3 files
> - Group 2: `feat(agents): add tmux frontmatter` — 5 files
> - (single group if only one commit)
> "Approve this plan?"

Options: `"Approve"`, `"Edit groups"`, `"Combine into one"`, `"Abort"`.

| Option | Action |
|--------|--------|
| `"Approve"` | Proceed to process groups sequentially. |
| `"Edit groups"` | Take the user's regrouping instructions, update the groups, and re-present. |
| `"Combine into one"` | Merge all groups into one and proceed as single commit. |
| `"Abort"` | Exit the workflow entirely. |

---

### 4–8. Process Each Commit Group (Sequentially)

For each group **in order** (foundational first, features last), run steps 4 through 8. Treat each group as an independent commit cycle.

---

### 4. Stage the Group's Files

Stage exactly the files belonging to the current group:

```bash
git add <file1> <file2> ...
```

> ⚠️ Stage **whole files only** — do **not** attempt `git add -p` (interactive hunk staging). The agent cannot interact with `git add -p`'s terminal prompts. If a file contains changes for multiple groups, split the file's changes manually before staging, or ask the user how to handle the overlap.

### 5. User Review of This Group's Changes

Present the staged diff for **this group only** and ask the user to review hunk-by-hunk. Do not skip this step.

Run:
```bash
git diff --staged
```

Present changes **one hunk at a time** using `ask_user`. Each hunk includes:
- **Context:** The file path and the hunk itself (the `@@ ... @@` block with surrounding context lines).
- **Question:** "Review this change for Group <N>."
- **Options:** `"Approve"`, `"Reject"`, `"Modify"`, or `"Comment"`.

#### Per-hunk options

| Option | Action |
|--------|--------|
| `"Approve"` | Accept this hunk as-is. Add it to the approved changes list. |
| `"Reject"` | Discard only this hunk: filter `git diff --staged <file>` to the rejected `@@` block and apply it as a reverse patch (`git apply --reverse`). Never whole-file `git checkout -- <file>` — the file may also contain your pre-existing uncommitted changes. |
| `"Modify"` | Accept but with adjustments (capture exact edits from the user, apply them, then present the updated hunk for final approval). |
| `"Comment"` | Proceed with the hunk as-is but record a note in the commit message. |

#### Flow rules

- **Do not proceed** to cleanup, testing, or commit until all hunks for this group have been explicitly approved or rejected.
- If **all hunks** in this group are rejected, skip this group entirely (leave the working tree changes as-is) and move to the next group.
- If specific hunks are rejected, apply only the rejected hunks' content as a reverse patch (extract the rejected `@@` blocks from `git diff --staged <file>` and pipe them through `git apply --reverse`) to discard them from the working tree. Do not use `git checkout -p` (interactive — the agent cannot drive its prompts) and never whole-file checkout. Approved hunks remain staged.
- Capture any comments and include them in the commit message body under a `Notes:` section.

### 6. Check for Unstaged Changes

Check `git status --short` for unstaged modified files not belonging to the current group. For each, run `git diff <file>` and **ask the user** whether to add to this group, commit separately in a later group, or leave them. Never silently skip them — they may be forgotten work or related fixes.

### 7. Clean Up Code

Delegate the mechanical cleanup to subagents to keep the main context lean. When splitting across **parallel** workers, the file groups **must be disjoint** (non-overlapping) so their edits can never conflict. After each delegation, **verify the actual diff** (`git status --short` + `git diff`) — do not trust the reported Files-Changed list.

| Step | Delegate to | What to pass in the task | Notes |
|---|---|---|---|
| Strip console.logs, add comments, a11y checks | worker | Scope: changed files. Rules: paste the complete relevant section(s) below **verbatim** (remove `console.log`/`console.debug`/`console.info`; keep `console.error`/`console.warn`; fix trailing commas left behind; apply the **a11y checklist** to changed markup; add inline comments explaining the why). | Mechanical; any parallel split must use disjoint file groups. |
| JSDoc | docs | Scope: changed files. Tell it to read the jsdoc-docs skill at `${PI_MY_SETUP:-$HOME/development/pi-setup}/skills/jsdoc-docs/SKILL.md` and follow it (TS complement rule, `@param`/`@returns`/`@throws`, skip-trivial, focus-on-changed-code). | Run **after** the worker passes (JSDoc is additive comment editing — parallel agents on the same files would conflict). |
| Unit + E2E tests | tester | Scope: the files under test — test files may be added alongside them. It must **not modify production code** — only add/adjust test files. | Its own system prompt covers vitest/Playwright, >80% coverage, and run-until-green — no Rules paste needed. |
| Optional gate | reviewer | Scope: changed files. Ask it to review the work so far and report findings. | Reviewer is read-only; route its findings back to `worker` as a follow-up task with the same Scope. Optional — skip for small/obvious diffs. |
| Grouping, approval, commit | — | Keep in the main agent: commit grouping needs the full conversation context. | |

- **Subagents do not see this skill.** For **worker**-delegated steps, paste the **complete** relevant rule section(s) from this file **verbatim** into the task text — not a summary. A delegated worker has no other access to these rules; paraphrasing re-introduces ambiguity and lets the rules drift. The **tester** and **docs** agents' own prompts carry their conventions, so their tasks pass only Scope and constraints.
- If no worker task is worth spawning for a single trivial file, do the cleanup inline — but prefer delegation for anything more than one small file.
- The worker cannot ask the user — it **reports** ambiguities in its output; collect them and ask the user once at the end of step 7.

#### Console logs

For each changed file:
- Remove `console.log()`, `console.debug()`, `console.info()` statements
- Keep `console.error()` and `console.warn()` as they may be intentional
- Fix trailing commas left behind by removed statements

#### Inline comments

Add or improve inline comments explaining the **why** (non-obvious logic, workarounds, platform quirks) — never restate what the code obviously does.

#### A11y checklist (changed markup only — never remove existing functionality)

For each changed JSX/TSX/Vue file with markup, check and fix:

1. **Images have alt text** — every `<img>` needs `alt="..."` (may be empty string for decorative images)
2. **Form inputs have labels** — every `<input>`, `<select>`, `<textarea>` must be associated with a label (wrapped `<label>`, `htmlFor`/`id`, or `aria-label`/`aria-labelledby`)
3. **Semantic HTML** — prefer `<button>` over `<div onClick>`, `<nav>` over `<div role="navigation">`, `<main>` over `<div role="main">`, etc.
4. **ARIA roles are valid** — `role` attribute values must be valid WAI-ARIA roles (e.g., `role="button"` only on non-button elements)
5. **`aria-label` / `aria-labelledby` on interactive elements** — icon-only buttons and close buttons need accessible names
6. **`aria-hidden` usage** — decorative icons use `aria-hidden="true"`; interactive elements are never hidden from assistive tech
7. **Heading hierarchy** — `<h1>`-`<h6>` follow a logical, non-skipping order on each page
8. **Focus indicators** — interactive elements have visible `:focus-visible` styles (not `outline: none` without replacement)
9. **Keyboard navigation** — interactive elements are Tab-reachable; no keyboard traps; modals close on Escape and return focus to the trigger; any element with a click handler that isn't a `<button>`/`<a>` also handles Enter and Space

> **When suggesting refactors**: never remove existing functionality. Prefer additive changes that preserve the original behavior while improving a11y.

#### JSDoc (delegated to `docs`)

The docs agent reads the jsdoc-docs skill itself. Key rules it follows (and that any inline JSDoc work must match):
- **TS complement rule** — in `.ts`/`.tsx`, the description line is always added (what and why), `@param`/`@returns` are skipped (types are on the signature, never write `@returns void`), `@throws`/`@deprecated`/`@example` are kept. In `.js`/`.vue`/non-TS, `@param`, `@returns`, `@description` are all required.
- Skip trivial code: simple getters/setters, one-line wrappers, test files, boolean flags.
- Focus on changed code only — never document the whole codebase.

### 8. Add or Update Unit and E2E Tests

- Check whether changed files have corresponding test files (`find . -name "*.test.ts" -o -name "*.spec.ts"`).
- **Generate missing test files** — delegate to the `tester` subagent (isolated context; it runs the tests itself and iterates until green):

  ```
  subagent agent="tester" task="Write unit tests for the changed modules in <scope>. Files under test: <files needing tests>. Constraints: only add/adjust test files, never production code — bugs found must be reported, not fixed. Add Playwright E2E tests if the repo has an e2e setup. Run the tests until green and report coverage."
  ```

  The tester only covers **logic-layer modules** (models, services, utils, composables, stores). For **complex components/pages** with no existing test file it must **skip** — mounting them produces brittle, low-value tests (overengineering). If a specific behavior inside such a component needs testing, it suggests extracting that logic into a dedicated util (pure function) — flag that to the user before committing.

- When **updating an existing** test file and the change is small/subtle, adjust inline in the main agent instead of delegating: match the existing setup (mocks, `describe`/`it` blocks, assertions), mock external services, keep tests deterministic and fast.

- **After delegation, verify the actual diff** — do not trust the reported Files-Created list: run `git status --short` and review the real `git diff` for the scope you passed.

- **Never commit broken tests.** If tests fail and the fix is non-obvious, ask the user.

#### Present Test Changes for Review

After tests have been added or updated and verified to pass, present all test diffs to the user for review **before** proceeding to the final validation in step 9.

Use `ask_user` to present each test change concisely. **Do not show the full test file diff.** Instead, show just the assertion block (`it(...)` / `expect(...)`) so the user can read it and confirm the test makes sense. Omit boilerplate (imports, mocks, setup, etc.) — only show the logic being tested.

> "Confirm this test assertion."

Options: `"Approve"`, `"Reject"`, `"Modify"`, or `"Comment"`.

| Option | Action |
|--------|--------|
| `"Approve"` | Accept this test hunk as-is. |
| `"Reject"` | Discard only the test hunk (reverse patch, as in step 5). If the file also carried your pre-existing changes, restore it from the step-1 baseline snapshot instead of "the original file". |
| `"Modify"` | Accept with adjustments (capture the user's exact edits, apply them, re-run tests, re-present for approval). |
| `"Comment"` | Proceed as-is but record a note for the commit message. |

**Rules:**
- Do **not** skip this review — test changes must be explicitly approved, just like code changes.
- If all test changes are rejected, the commit still proceeds without tests (note this in the commit body).
- If specific hunks are rejected, apply only the rejected content as a reverse patch.
- Re-run tests after any modifications to confirm they still pass.

### 9. Validate Final Changes for This Group

After cleanup (step 7) and test review (step 8) have been completed, show the user the diff of **agent-introduced cleanup changes only** (JSDoc, comments, stripped console.logs, a11y fixes) for final validation before committing.

> ⚠️ Test changes were already reviewed hunk-by-hunk in step 8 — they are **not** re-presented here. This step validates only the cleanup changes the agent introduced.

Use `ask_user` to present the `git diff` of cleanup changes and ask:

> "Group <N> diff after cleanup. Do you approve these changes for commit?"

Options: `"Approve"`, `"Request changes"`, `"Abort"`.

| Option | Action |
|--------|--------|
| `"Approve"` | Proceed to stage and commit. |
| `"Request changes"` | Take notes on what the user wants adjusted, make the edits, and loop back to present the diff again. |
| `"Abort"` | Discard only the agent-generated changes and exit: for new files, delete them only if they were NOT present in `/tmp/commit-full-baseline.status`; for tracked files, reverse-patch the agent cleanup hunks (step 5 mechanism). Never run unscoped `git clean -fd` or whole-file `git checkout -- <file>` — the tree contains your own uncommitted work that those commands would destroy. |

> ⚠️ This step is intentionally separate from the earlier hunk-by-hunk reviews (steps 5 and 8). Step 5 covered the **original** code changes for this group. Step 8 covered the **test** changes. This step validates only the **cleanup** changes the agent introduced — JSDoc, comments, and incidental fixes.

### 10. Commit This Group

- **Stage the complete group** — the original approved changes PLUS the agent
  cleanup edits (step 7) and approved test files (step 8) must all go into the
  commit. Agent edits and new test files are unstaged/untracked at this point,
  so relying on the step-4 staging alone would silently omit them:
  ```bash
  git add -- <exact group files> <approved test files>
  ```
- Verify `git diff --staged --stat` shows the full group (every approved file,
  including the cleanup and test edits) before committing.
- Write a **conventional commit message**:
  - Format: `<type>(<scope>): <short summary>`
  - Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`, `style`
  - Use the type/scope/summary defined in step 2 for this group.
- Commit:
  ```bash
  git commit -m "<type>(<scope>): <summary>"
  ```
- Verify the commit with `git log --oneline -1`.

---

### After All Groups Are Committed

Once steps 4–10 have been completed for every group, the workflow stops at
local commits.

> **Inline vs. delegated:** inline execution is only for the explicitly listed
> trivial/single-file exceptions (quick single-file test updates, small JSDoc
> tweaks). All other cleanup, documentation, test generation, and test runs
> must use the corresponding subagent.

**CRITICAL: Never run `git push` (or `git push --force`).** This workflow
commits locally and stops. Pushing is a separate, explicitly user-requested
step.

---

## Rules

- **Never commit build artifacts** (`node_modules/`, `dist/`, `*.min.js`, `.next/`, etc.).
- **Never commit sensitive data** (auth tokens, credentials, `.env` files with real values).
- If uncommitted changes exist that were not addressed in steps 4–10, warn the user and leave them unstaged.
- **Never push to remote.**
- If tests fail, do not commit — fix the tests first or ask the user.
