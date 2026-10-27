# Colour token naming

Based on the talk [Design Tokens on Asana's Design Systems Team](https://www.youtube.com/watch?v=ylDed18OVdY).

Every colour token in `src/ui/styles/tokens/_colors.scss` is named by composing
four orthogonal axes. The name reads as a sentence, so a token says _which_ semantic
role it plays, not just _what_ it is.

```
<sentiment>-<usage>-<prominence>[-<interaction>]
```

| Axis        | Presence | Values                                                                            |
| ----------- | -------- | --------------------------------------------------------------------------------- |
| sentiment   | optional | `success`, `warning`, `danger`, `info`\*, `brand`\*, `selected`, `upsell`, `beta` |
| usage       | required | `background`, `text`, `icon`, `border`                                            |
| prominence  | optional | `weak`, `medium`, `strong`, `inverse`\*                                           |
| interaction | optional | `hover`, `active`, `disabled`                                                     |

\* The slide's sentiment set is `default`, `success`, `warning`, `danger`, `upsell`, `selected`, `beta`; its prominence set is `default`, `weak`, `medium`, `strong`.

**`default` is omitted from every segment.** Only non-default parts appear in
the name:

| Full form                    | Token                       |
| ---------------------------- | --------------------------- |
| default-text-default-default | `--text`                    |
| default-text-weak-default    | `--text-weak`               |
| default-text-default-hover   | `--text-hover`              |
| success-text-default-default | `--success-text`            |
| brand-text-strong-hover      | `--brand-text-strong-hover` |

A name therefore ends at its last non-default segment. Usage is always
present; sentiment, prominence and interaction only appear when they are not
`default`.

## Exceptions

`--focus-ring` is deliberately outside the grid: `focus` is not a usage.

## Adding a new token

1. Decide the axes. Start from the role, not the CSS property:
   _sentiment_ (is it neutral, brand, or a status?), _usage_ (background, text,
   icon, border?), _prominence_ (default, weak, medium, strong?), _interaction_
   (default, hover, active, disabled?).
2. Compose the name and drop every `default` segment. `brand` + `background` +
   `strong` + `default` → `--brand-background-strong`.
3. Declare it in the `@mixin tokens` block in
   `src/ui/styles/tokens/_colors.scss`. The Galactic Atlas design has no light
   theme, so tokens apply regardless of `prefers-color-scheme` — there is a
   single set of values, not a light/dark pair.

## Role of the `usage` axis

`usage` describes the colour's **semantic role**, not necessarily the CSS
property it is applied to. Two deliberate compromises:

- Disabled checkbox/radio fills reference `--border`, even though they set
  `background-color`, because the fill is literally the border colour.
- The disabled control mark references `--text-weak`.

When a single colour serves several roles, it becomes several tokens that
happen to share a value (`--brand-text-strong`, `--brand-border-strong`,
`--brand-background-strong`) so each role can be overridden independently.
