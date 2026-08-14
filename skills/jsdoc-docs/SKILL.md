---
name: jsdoc-docs
description: Add JSDoc annotations, maintain inline documentation, and update READMEs across the codebase. Never changes runtime behavior — only comments and documentation files. Use when documenting changed or new code before committing.
---

# JSDoc & Documentation

Read source files and add JSDoc annotations, clean up stale comments, and update READMEs. Never change any runtime code — only comments and documentation files.

## Scope

1. **Add JSDoc** to undocumented functions, methods, classes, constants, and type definitions.
2. **Audit and clean** stale/incorrect inline comments.
3. **Update READMEs** — add usage examples, API docs, setup instructions, architecture notes.

## General rules

1. **Never change runtime behavior** — do not touch variable values, function bodies, imports, exports, or logic. Only add/modify comments.
2. **Respect existing style** — if the file uses `/** ... */` JSDoc blocks, use that. If it uses line comments (`//`), stay consistent. If it has no docs, default to JSDoc `/** ... */`.
3. **Skip trivial code** — don't add JSDoc to:
   - Simple getters/setters (`get foo() { return this._foo }`)
   - Obvious one-liner wrappers
   - Test files (unless explicitly asked)
   - Boolean flags and internal state toggles
4. **Don't state the obvious** — a JSDoc like `/** The name */` on a property called `name` adds nothing. Only document when the intent, contract, or constraints aren't obvious from the name and signature.
5. **Cover side effects and constraints** — always document:
   - **`@throws`** — when does it throw? What errors?
   - **`@param`** — types and meaning, especially for non-obvious parameters
   - **`@returns`** — what is returned? What does `null`/`undefined` mean?
   - **Edge cases** — empty arrays, null inputs, negative values, etc.
6. **Use `@deprecated`** when a function has a comment or naming that suggests it's legacy/unused, with a hint about the replacement if known (but never invent replacements).
7. **Keep descriptions crisp** — one sentence for simple things, more only when needed. Use active voice.
8. **Preserve existing JSDoc** — if a function already has a JSDoc block, leave it alone unless it's clearly wrong or stale.
9. **Focus on changed code** — when invoked during a commit workflow, document only the files/methods touched by the branch, not the whole codebase.

## How to find undocumented code

```bash
# Find files with exports but no JSDoc
rg -l "export (default )?(function|const|class)" src/ | head -20
```

Work file-by-file, reading the full source before editing.

## JSDoc style guide

### Functions

```js
/**
 * Fetches chart data for the given dashboard and date range.
 *
 * Returns cached data if available and not stale; otherwise fetches
 * from the API and updates the cache.
 *
 * @param {string} dashboardId - UUID of the dashboard
 * @param {Object} dateRange - Start and end dates
 * @param {string} dateRange.start - ISO 8601 start date
 * @param {string} dateRange.end - ISO 8601 end date
 * @param {Object} [options] - Optional overrides
 * @param {boolean} [options.forceRefresh=false] - Bypass cache
 * @returns {Promise<ChartData|null>} Chart data, or null if not found
 * @throws {ApiError} If the API returns a non-2xx status
 */
```

### TypeScript complement rule

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

#### In JavaScript / non-TypeScript files

Follow the original rules — `@param`, `@returns`, `@description` are all needed since there's no type system to infer from.

JSDoc should include:
- `@description` - What the function/type does (use the tag in .js/.jsx files, leading text in .ts)
- `@param` - Parameters with types
- `@returns` - Return value type
- `@throws` - Possible exceptions
- `@example` - Usage example if complex

### Type definitions / constants

```js
/**
 * @typedef {Object} ChartDefinition
 * @property {string} id - Unique chart identifier
 * @property {string} name - Display name
 * @property {'bar'|'line'|'number'|'donut'} type - Chart visualization type
 * @property {Object} query - The analytics query configuration
 */

/** Available comparison operators for numeric filters */
export const COMPARISON_OPERATORS = {
  EQ: 'eq',     /** @description Equal to */
  GT: 'gt',     /** @description Greater than */
  GTE: 'gte',   /** @description Greater than or equal */
  LT: 'lt',     /** @description Less than */
  LTE: 'lte',   /** @description Less than or equal to */
} /** @type {Object<string, string>} */
```

## README updates

When asked to update a README, work in this order:

1. Read the existing README and the directory structure
2. Check entry points, exports, and key files
3. Add or update sections for:
   - **Installation / setup** (if applicable)
   - **Usage** — key exports with short examples
   - **API** — main functions, components, or modules
   - **Architecture** — how the module fits in
4. Keep READMEs concise — prefer links to source over duplicating docs

## Reporting

When done, report:
- Files modified (path, what was added/changed)
- Any unclear or ambiguous code you encountered
- Suggestions for further documentation improvements
