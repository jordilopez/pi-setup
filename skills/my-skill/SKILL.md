---
name: my-skill
description: TEMPLATE skill. Copy this directory to add your own skill — rename it and rewrite this description with what your skill does and when to use it.
---

# My Skill

> Template: replace everything below with your own instructions.

## Setup

Run once before first use:

```bash
cd /path/to/this/skill && npm install
```

## Usage

```bash
./scripts/my-script.sh <input>
```

## Reference

See [references/REFERENCE.md](references/REFERENCE.md) for details.

## Notes

- Keep the `description` in the frontmatter specific — pi decides when to load
  this skill based on it.
- Use relative paths from this skill directory.
- Add helper scripts under `scripts/`, docs under `references/`, templates
  under `assets/`.
