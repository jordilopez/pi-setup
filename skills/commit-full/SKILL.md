---
name: commit-full
description: Full commit workflow removes console.logs, adds JSDoc, unit tests, E2E tests, and commits. Never pushes to remote.
---

# Commit Full Skill

Performs a comprehensive commit workflow on uncommitted changed files:
1. Removes all `console.log`, `console.debug`, `console.info` statements
2. Adds JSDoc documentation blocks where missing or incomplete
3. Ensures accessible markup with proper a11y attributes
4. Ensures keyboard navigation support
5. Adds unit tests for modified code
6. Adds E2E tests for modified pages/features
7. Commits changes locally
8. **Never pushes to remote**

## Usage

```
/skill:commit-full [message]
```

If no message is provided, a default message is generated based on the changes.

## Delegation

Delegate the mechanical steps to subagents to keep the main context lean.

**Subagents do not see this skill.** For **worker**-delegated steps, paste the
**complete** relevant rule section(s) from this file **verbatim** into the task
text — not a summary. A delegated worker has no other access to these rules;
paraphrasing re-introduces ambiguity and lets the rules drift. The **tester**
agent's own system prompt already carries the unit/E2E conventions (vitest,
>80% coverage, run-until-green), so tester tasks pass only Scope and the
no-production-code constraint.

Use this task-text template for every delegation:

```
Scope: <changed production files; test files may be added alongside>
Rules: <complete pasted rule section(s), verbatim — worker steps only>
Constraints: do not modify files outside Scope; report Files-Changed and tests run.
```

Delegate only when the task boundaries are clear and the edit is mechanical. If
two edits must touch overlapping hunks, keep them in the same worker. For
**parallel** workers the file groups **must be disjoint** (non-overlapping), so
their edits can never conflict or overwrite one another.

| Step | Delegate to | What to pass in the task | Notes |
|---|---|---|---|
| 2. Console logs | worker | Scope: changed files. Rules: paste the complete **Remove Console Logs** section (remove `console.log`/`console.debug`/`console.info`; keep `console.error`/`console.warn`; fix trailing commas left behind). | Mechanical; any parallel split must use disjoint file groups. |
| 3. JSDoc | worker | Scope: changed files. Rules: paste the complete **Add JSDoc Blocks** section — the TS complement rule (skip `@param`/`@returns` in `.ts`/`.tsx`) vs the `.js`/`.vue`/non-TS rule (`@description`, `@param`, `@returns` all required), **and** the target list: exported functions, types/interfaces, Vue `<script setup>`, event handlers, and callbacks. | Include the TS-vs-JS table and the Before/After examples. |
| 4–5. a11y + keyboard | worker | Scope: changed files. Rules: paste the complete **Ensure Accessible Markup** and **Ensure Keyboard Navigation** sections (full checklists), plus the a11y refactor rule: never remove existing functionality. | For large diffs, split into **disjoint** file groups across parallel workers only. |
| 6. Unit tests | tester | Scope: the files under test — test files may be added alongside them. It must **not modify production code** — only add/adjust test files. | Its own system prompt covers vitest/coverage/run-loop; no Rules paste needed. |
| 7. E2E tests | tester | Same as unit tests, incl. the no-production-code rule. | Run after unit tests when they cover the same feature. |
| Optional gate | reviewer | Scope: changed files. Ask it to review the work so far and report findings. | Reviewer is read-only; route its findings back to `worker` as a follow-up task with the same Scope. Optional — skip for small/obvious diffs. |
| 1, 8, 9 | — | Keep in the main agent: trivial commands, and commit grouping needs the full conversation context. | |

After each delegation returns, **verify the diff** — do not treat the reported
Files-Changed list as authoritative (the worker runs on your shared working
tree):
1. Inspect `git status --short` and review the actual `git diff`.
2. Reconcile the diff with the task's `Scope`; flag any file outside it.

Run the test suite **after test-related steps** (or once before commit), not
after every delegation — the tester discovers the actual runner; fall back to
`npx vitest run` only when Vitest is the established project convention.

## Workflow

### 1. Identify Changed Files

```bash
git status --porcelain
```

Only process files that are modified and uncommitted. For a new/empty repository (no commits yet), all files are uncommitted — apply the same workflow.

### 2. Remove Console Logs

For each changed file:
- Remove `console.log()`, `console.debug()`, `console.info()` statements
- Keep `console.error()` and `console.warn()` as they may be intentional

Pattern to remove:
- `console.log(...)` with any arguments
- Multi-line console.log statements
- Trailing commas before console.log (fix syntax)

### 3. Add JSDoc Blocks

Add JSDoc documentation to:
- Exported functions without JSDoc
- Type definitions and interfaces
- Vue component `<script setup>` sections
- Event handlers and callbacks

#### In TypeScript files (`.ts`, `.tsx`)

TypeScript already provides types for params, returns, and fields. JSDoc should **complement**, not repeat, what the type system already says.

| JSDoc tag | In `.ts`/`.tsx` files |
|---|---|
| Description text (first line) | ✅ Always add — explains **what** and **why** |
| `@param` | ❌ Skip — types are on the function signature |
| `@returns` | ❌ Skip — return type is on the signature. Never write `@returns void` |
| `@throws` | ✅ Keep — TS can't express this |
| `@deprecated` / `@see` | ✅ Keep — lifecycle metadata TS can't express |
| `@example` | ✅ Keep — shows real usage |
| `@remarks` / `@note` | ✅ Keep — for extended context beyond the brief description |
| Property `/** ... */` on interface fields | ✅ Keep — shows in IDE tooltips |

**Before** (redundant):
```ts
/**
 * Filters items by keyword.
 *
 * @param query - The search term
 * @returns Whether the item matches
 */
function matches(query: string): boolean { ... }
```

**After** (clean):
```ts
/** Filters items by keyword. */
function matches(query: string): boolean { ... }
```

#### In JavaScript / Vue / non-TS files

Follow the original rules — `@param`, `@returns`, `@description` are all needed since there's no type system to infer from.

JSDoc should include:
- `@description` - What the function/type does (use the tag in .js/.vue, leading text in .ts)
- `@param` - Parameters with types
- `@returns` - Return value type
- `@throws` - Possible exceptions
- `@example` - Usage example if complex

### 4. Ensure Accessible Markup

For each changed JSX/TSX file (components, pages, layouts):

Check that markup includes proper accessibility attributes and suggest fixes:

#### Required checks

1. **Images have alt text** — every `<img>` (or `next/image`) needs `alt="..."` (may be empty string `""` for decorative images)
2. **Form inputs have labels** — every `<input>`, `<select>`, `<textarea>` must be associated with a label (wrapped `<label>`, `htmlFor`/`id`, or `aria-label`/`aria-labelledby`)
3. **Semantic HTML** — prefer `<button>` over `<div onClick>`, `<nav>` over `<div role="navigation">`, `<main>` over `<div role="main">`, etc.
4. **ARIA roles are valid** — `role` attribute values must be valid WAI-ARIA roles (e.g., `role="button"` only on non-button elements, never on an actual `<button>`)
5. **`aria-label` / `aria-labelledby` on interactive elements** — icon-only buttons, close buttons, and controls need accessible names
6. **`aria-hidden` usage** — decorative icons use `aria-hidden="true"`; interactive elements are never hidden from assistive tech
7. **Heading hierarchy** — `<h1>`-`<h6>` follow a logical, non-skipping order on each page
8. **Color contrast** — if inline text colors are used, check they contrast sufficiently against their background; flag hardcoded low-contrast combinations
9. **Focus indicators** — ensure interactive elements have visible `:focus-visible` styles (not `outline: none` without replacement)

> **When suggesting refactors**: Never remove existing functionality. Prefer additive changes that preserve the original behavior while improving a11y.

#### Example suggestions

| ❌ Found | ✅ Suggest |
|---|---|
|---|---|
| `<img src="/hero.jpg" />` | `<img src="/hero.jpg" alt="Hero banner" />` |
| `<div onClick={handleClick}>X</div>` | `<button onClick={handleClick} aria-label="Close">X</button>` |
| `<input onChange={...} />` | `<label htmlFor="search">Search</label><input id="search" onChange={...} />` |
| `<div role="navigation">` | `<nav>` |

### 5. Ensure Keyboard Navigation

For each changed JSX/TSX file with interactive elements:

Check that the component supports full keyboard navigation and suggest fixes:

#### Required checks

1. **All interactive elements are focusable** — buttons, links, inputs, selects, and custom interactive widgets must be reachable via <kbd>Tab</kbd>
2. **No keyboard traps** — focus must never get stuck on an element; <kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> must move focus out
3. **Custom interactive widgets follow ARIA patterns** — e.g., combobox, dialog, tabs, accordion, menu — these need proper `role`, `aria-*`, and keyboard handlers (Enter, Escape, Arrow keys)
4. **Click handlers have key handlers** — any element with `onClick` (that isn't a `<button>` or `<a>`) must also handle <kbd>Enter</kbd> and <kbd>Space</kbd> via `onKeyDown`
5. **`tabIndex` is used correctly** — `tabIndex="0"` to make an element focusable in natural order, `tabIndex="-1"` for programmatic focus only, never `tabIndex` with positive integers
6. **Escape closes modals/dropdowns/menus** — overlay components must close on <kbd>Escape</kbd>
7. **Focus is managed in dynamic UIs** — when a modal opens, focus moves into it; when it closes, focus returns to the trigger element
8. **Skip links** — if the page has a persistent navigation header, suggest adding a skip-to-main-content link

> When suggesting keyboard navigation fixes, prefer the simplest solution that matches the component's existing interaction pattern.

#### Example suggestions

| ❌ Found | ✅ Suggest |
|---|---|
| `<AccordionItem onClick={toggle} />` | Add `onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggle() }}` and `role="button" tabIndex="0"` |
| `<Dropdown onMouseEnter={open} onMouseLeave={close} />` | Add `onFocus`/`onBlur` so keyboard users can open/close the dropdown |
| `<Modal />` that doesn't manage focus | Trap focus inside modal, close on Escape, return focus on close |

### 6. Add Unit Tests

Create unit tests in existing test directories:
- Use Vitest for unit tests (`*.test.ts`, `*.spec.ts`)
- Test functions with various inputs
- Mock external dependencies
- Aim for >80% coverage on changed files

Test file naming:
- `test/<name>.test.ts` for utilities
- Co-located `*.test.ts` files for modules

### 7. Add E2E Tests

Add Playwright E2E tests:
- Test the affected pages/features
- Include happy path and error cases
- Test navigation and redirects
- Location: `tests/` or `e2e/` directory

Example E2E test structure:
```typescript
import { test, expect } from '@playwright/test';

test.describe('feature', () => {
  test('should do something', async ({ page }) => {
    await page.goto('/page');
    // assertions
  });
});
```

### 8. Group Files into Logical Commits

Decide whether to group all changes into **one commit** or **multiple commits**
based on the type and scope of changes. The goal is that **each commit tells
a single story** — revertible, reviewable, and meaningful in isolation.

#### When to use ONE commit:
- Small changes (<5 files) that belong to the same concern
- Changes that are tightly coupled (same feature, can't work independently)
- Bug fixes that touch 1-2 files

#### When to use MULTIPLE commits (one per logical group):
- Large changes (>5 files) touching different areas
- Changes across backend + frontend + config that are independent
- Initial project setup with many new files across contexts

#### How to split: split by **context/domain**, not by file count

Ask yourself: "If I need to revert or cherry-pick one part, would I want the
others to come along?" If no, split them.

Common logical groups by scenario:

**Initial project setup:**
1. `chore(config):` — EditorConfig, Prettier, nvmrc, gitignore
2. `chore(deps):` — Dependencies (package.json, requirements.txt, pyproject.toml)
3. `feat(core):` or `feat(api):` — Core source code
4. `test:` — Tests
5. `docs:` — README, AGENTS, PLAN

**Feature work:**
1. `feat(api):` — Backend logic, endpoints, workers
2. `feat(ui):` — Frontend components, styles, pages
3. `test:` — Tests for the new feature

**Maintenance:**
1. `fix(scope):` — Bug fix with its tests
2. `chore(config):` — Config changes (.env, nuxt.config)
3. `docs:` — Documentation updates

### 9. Stage and Commit

#### Single commit:
```bash
git add -A
git commit -m "<type>(<scope>): <description>"
```

#### Multiple commits:
```bash
# Unstage everything first to avoid accidental inclusions
git reset HEAD -- . 2>/dev/null

# For each logical group:
git add <file1> <file2> ...
git commit -m "<type>(<scope>): <description>"
```

> ⚠️ **Initial (root) commit**: A root commit has no parent (`HEAD~1` doesn't work).
> To undo it, use `git update-ref -d HEAD` instead of `git reset --soft HEAD~1`.

Do NOT use `git add -A` or `git add .` when doing multiple commits —
add only the specific files for each commit.

**CRITICAL: Never run git push or git push --force**
