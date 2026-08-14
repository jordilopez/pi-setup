# A11y Checklist (changed markup only — never remove existing functionality)

Companion to `skills/commit-full/SKILL.md` — read and apply this to changed
JSX/TSX/Vue markup only. Never remove existing functionality; prefer additive
changes that preserve the original behavior while improving a11y.

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
