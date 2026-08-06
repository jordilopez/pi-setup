# pi-setup

Personal pi configuration: **skills**, **extensions**, and **subagents** shared
across all your pi instances. Install it once, keep it in one git repo, and sync
it to any machine.

## What's inside

```
pi-setup/
├── package.json          # pi package manifest (extensions, skills, prompts)
├── extensions/
│   └── subagent/         # subagent tool: delegate work to isolated pi processes
│       ├── index.ts
│       └── agents.ts
├── skills/
│   └── my-skill/         # template skill — copy it to add your own
│       └── SKILL.md
├── agents/               # subagent definitions (installed separately — see below)
│   ├── scout.md          # fast codebase recon
│   ├── planner.md        # implementation plans
│   ├── reviewer.md       # code review
│   └── worker.md         # general-purpose
├── prompts/              # workflow prompt templates for the subagent tool
│   ├── implement.md      # scout -> planner -> worker
│   ├── scout-and-plan.md
│   └── implement-and-review.md
└── scripts/
    └── setup.sh          # one-command install
```

## Install

```bash
./scripts/setup.sh
```

This does two things:

1. **Registers the repo as a pi package** (`pi install ./`) — loads
   `extensions/`, `skills/`, and `prompts/` into your user settings
   (`~/.pi/agent/settings.json`). Re-run to update.
2. **Symlinks `agents/*.md` into `~/.pi/agent/agents/`** — pi packages cannot
   ship subagent definitions, so agent files are linked separately. Existing
   non-symlink files are never overwritten.

Restart pi (or run `/reload`) after installing.

## Using subagents

Prompt the model to delegate work with the `subagent` tool:

```
Use scout to find all authentication code
```

- **Single**: one agent, one task
- **Parallel**: `Run 2 scouts in parallel: one for models, one for providers`
- **Chain**: `scout -> planner -> worker`

Or use the workflow prompt templates:

```
/implement add Redis caching to the session store
/scout-and-plan refactor auth to support OAuth
/implement-and-review add input validation to the API
```

Each subagent runs in a separate `pi` process with an isolated context window.
See [the subagent example docs](https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/subagent)
for full details.

## Adding your own stuff

### Skills

Copy `skills/my-skill/` to `skills/<your-skill>/` and edit `SKILL.md`.
Required frontmatter (see [pi docs: skills](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/skills.md)):

```markdown
---
name: my-skill            # lowercase a-z, 0-9, hyphens, max 64 chars
description: What this skill does and when to use it. Be specific.
---
```

### Subagents

Drop a markdown file into `agents/` with YAML frontmatter and a system prompt
body, then re-run `./scripts/setup.sh`:

```markdown
---
name: my-agent
description: What this agent does
tools: read, grep, find, ls
model: claude-haiku-4-5
---

System prompt for the agent.
```

Available fields: `name` (required), `description` (required), `tools`
(comma-separated), `model`.

### Extensions

Add TypeScript files to `extensions/` (either `extensions/foo.ts` or
`extensions/foo/index.ts`). See [pi docs: extensions](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/extensions.md).

## Notes

- The `subagent` extension and the agent/prompt files are derived from pi's
  [MIT-licensed example](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/subagent/).
- This repo itself is MIT licensed — see [LICENSE](LICENSE).
- Keep this repo's settings/state out of git: extension sessions, logs, etc.
