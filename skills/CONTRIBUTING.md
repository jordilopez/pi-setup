# Contributing to skills

This package's skills live under `skills/<skill-name>/SKILL.md` and are
advertised to Pi agents through each skill's frontmatter `description:`
field. The skill-matching step happens **before** any skill body is read,
so a skill that fails to match at description time is invisible to the
agent regardless of how good its body is.

This document captures two things every skill author here should know:

1. **The `description:` convention** — verb-led, trigger-rich, and
   scoped.
2. **A chain-of-thought priming snippet** for users whose default model
   parses skills poorly (DeepSeek, Minimax, open-weights without
   thinking).

---

## 1. The `description:` convention

Pi concatenates every skill's `description:` into one advertised-skill
list in the system prompt. The model picks skills by matching that text
against the user's intent. Match quality drops sharply across model
families:

| Model family                          | Skill detection                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| OpenAI Codex / o-series               | High — system-prompt parsing and tool selection are first-class training objectives.    |
| Claude / Gemini with thinking enabled | High — match happens during the thinking pass.                                          |
| DeepSeek, Minimax, most open-weights  | Lower — answer-first tendency; they ingest the list but rarely re-read it mid-response. |

A well-shaped description is the cheapest universal fix.

### The 4-line template

```text
[Verb-led one-line summary of what the skill does.]
Use when the user says "<phrase 1>", "<phrase 2>", "<phrase 3>", or otherwise wants <the underlying intent, in their words>.
[Scope statement — what is in and what is out, including refusal triggers.]
[Safety or guard-rail detail the user should know up front.]
```

Each line has a single job.

### Concrete rules

1. **Start with a verb.** "Apply…", "Generate…", "Analyze…", "Add…",
   "Prepare…", "Audit…". Avoid "This skill…", "Used to…", "Provides
   the ability to…".
2. **Lead with intent, not capability.** The description is matched
   against the user's request, not against the skill's body capability.
3. **Include 3–5 user-typed trigger phrases.** Quote them. These are
   the strings a user would actually type: "open a PR", "add JSDoc",
   "plan my commits", "commit this", "frontend tip", "protect main".
   Paraphrases match poorly; quoted phrases match well.
4. **State what the skill will _not_ do.** "No push", "no remote ops",
   "refuses trunk branches", "comments only — never runtime code".
   This both sharpens matching and prevents accidental misuse.
5. **Keep it under ~120 words** when possible. The skills list grows;
   long descriptions compete for limited attention and dilute triggers.
6. **Don't restate the body.** If a rule lives in the skill body, the
   description should _not_ restate it. Description is the matching
   surface; body is the execution surface. Mixing them weakens both.
7. **Stay stack-agnostic when the skill is.** A skill that works on
   any project ("apply design tokens", "add JSDoc") should not narrow
   its triggers to one framework or repo convention.

### Examples

**❌ Bad — vague, capability-only, no triggers:**

```yaml
description: Configure branch protection for a GitHub repo.
```

**✅ Good — verb-led, trigger-rich, scope explicit:**

```yaml
description: >-
  Apply or audit a generic GitHub branch-protection policy to one or
  more repositories via the `gh` CLI. Use when the user says "set up
  branch protection", "protect main", "require PR reviews",
  "enforce CODEOWNERS", "audit branch protection", or otherwise wants
  a declarative protection policy (PRs, approvals, code-owner
  reviews, admin enforcement, force-push/deletion blocking, status
  checks) applied or reviewed across repositories. Idempotent and
  audit-first: always reads current state, shows the diff, asks before
  any write.
```

**❌ Bad — describes the body, not the user's request:**

```yaml
description: Split staged changes into one or more conventional commits based on package, type, and cohesion.
```

**✅ Good — what the user is asking for, in their words:**

```yaml
description: >-
  Analyze current local changes and produce an executable local-commit
  plan with split groups, cleanup, tests, validation, and no-push
  safeguards. Use when the user says "plan my commits", "how should I
  structure these commits", "split this into commits", "atomic commit
  layout", "what goes into this commit", or otherwise wants the change
  sliced into independently revertible commits before any files are
  staged. Planning only — no edits, no staging, no cleanup, no commits,
  no push.
```

### The 3-line checklist

Before merging any new or changed `description:`:

1. Does it start with a verb?
2. Does it include 3+ user-typed phrases, in quotes?
3. Does it state what the skill will not do?

If any answer is "no", rewrite.

---

## 2. Skill-aware chain-of-thought priming (for weaker parsers)

OpenAI Codex and o-series detect skills during a thinking pass before
they commit to an answer. Most open-weight models (DeepSeek, Minimax,
etc.) answer first and only re-read tools when blocked. A short
chain-of-thought (CoT) snippet in the user's `~/.pi/agent/AGENTS.md`
fixes this with very low cost.

### When to use it

Use priming **only if** the user's default model is _not_ Codex /
o-series / Claude-with-thinking / Gemini-with-thinking. If the active
model already has a thinking pass, priming is redundant: it adds
latency without changing match quality.

If the model is reasoning-capable but weaker on system-prompt parsing,
priming tends to help modestly. The rule of thumb: prim if the model
isn't one of the four families above.

### The snippet

Drop this into `~/.pi/agent/AGENTS.md`, or into any AGENTS.md the
agent loads at session start:

```markdown
## Skill-aware response priming

Before answering any user request — including simple ones — perform
these three steps in your thinking pass:

1. Scan the `<available_skills>` block in the system prompt.
2. List any skill whose `description:` matches the user's intent,
   including matches found via trigger phrase, scope overlap, or
   domain keyword. Prefer invocation over mention: if a skill applies,
   load it (read its `SKILL.md`) before producing your first
   non-trivial output.
3. If no skill applies, proceed as normal; do not invent one.

Do this silently — do not narrate the scan or list skill names in the
visible response unless a skill is actually being invoked.
```

### Why this works

The model is being told, in its own framing, to perform the match step
that OpenAI's training already embeds. For weaker parsers this single
instruction shifts them from "answer-first" to "match-then-answer",
which is the only difference that matters. Keep the snippet short on
purpose: long prime prompts get summary-skipped by the very parsers
that need them.
