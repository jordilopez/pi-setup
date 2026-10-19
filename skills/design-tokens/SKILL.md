---
name: design-tokens
description: >-
  Apply the Asana-style design token naming convention. Use when creating,
  naming, renaming, or reviewing design tokens — especially colour tokens —
  in any project, or when setting up a project's token layer. Enforces the
  `<sentiment>-<usage>-<prominence>[-<interaction>]` grammar with `default`
  segments omitted, treats `usage` as semantic role rather than CSS property,
  and keeps tokens single-purpose so each role can be themed independently.
---

# Design token conventions

A portable convention for naming design tokens, based on
[Design Tokens on Asana's Design Systems Team](https://www.youtube.com/watch?v=ylDed18OVdY).
The full source note is bundled at
[`references/colour-token-naming.md`](./references/colour-token-naming.md).

## When to use

- Adding, naming, or renaming tokens in a project's token layer.
- Reviewing a token name that is opaque (`--blue-500`, `--gray-2`) or that
  encodes a CSS property rather than a role.
- Bootstrapping a new project's tokens.

Do **not** invent project-specific token vocabularies when this grammar
applies — the point is that a token name reads as a sentence and means the
same thing in every codebase.

## The naming grammar

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

### `default` is omitted from every segment

Only non-default parts appear in the name. A name ends at its last
non-default segment:

| Full form                    | Token                       |
| ---------------------------- | --------------------------- |
| default-text-default-default | `--text`                    |
| default-text-weak-default    | `--text-weak`               |
| default-text-default-hover   | `--text-hover`              |
| success-text-default-default | `--success-text`            |
| brand-text-strong-hover      | `--brand-text-strong-hover` |

`usage` is always present; sentiment, prominence and interaction appear only
when they are not `default`.

## `usage` is a semantic role, not a CSS property

`usage` describes what the colour _means_, not what it is applied to. Two
deliberate compromises from the source project:

- Disabled checkbox/radio fills reference the border token even though they
  set `background-color`, because the fill is literally the border colour.
- The disabled control mark references the weak text token.

When one colour serves several roles, declare several tokens that happen to
share a value (`--brand-text-strong`, `--brand-border-strong`,
`--brand-background-strong`) so each role can be overridden independently.
Do not reuse a single token across roles to save a line.

## Adding a token

1. Decide the axes from the role, not the CSS property:
   - _sentiment_ — neutral, brand, or a status?
   - _usage_ — background, text, icon, or border?
   - _prominence_ — default, weak, medium, or strong?
   - _interaction_ — default, hover, active, or disabled?
2. Compose the name and drop every `default` segment.
   `brand` + `background` + `strong` + `default` → `--brand-background-strong`.
3. Declare it in the project's token source of truth alongside the others.
4. If a value is a raw colour literal, check whether an existing role token
   already carries that value — prefer a new named role over an alias.

## Exceptions

A small number of tokens sit deliberately outside the grid — for example a
focus ring, since `focus` is not a `usage`. Keep exceptions rare, documented,
and named for the role they play.

## Applying to a project

- Tokens live in one token layer with a single source of truth; partials may
  group by category (colour, space, typography, motion) as long as the
  grammar holds for every name.
- Prefer single-purpose tokens over generic palette names. A token named for
  its role can be re-themed without touching consumers.
- If the project has a light/dark theme, the _name_ stays the same and only
  the value changes per theme.
