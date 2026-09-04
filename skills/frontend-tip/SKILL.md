---
name: frontend-tip
description: >-
  Generates one fresh frontend development tip on demand. Use when the user
  explicitly asks for a frontend tip, a frontend tip of the day, a frontend
  dev tip, or a tip about Vue, React, Angular, browser APIs, JavaScript,
  TypeScript, SCSS, CSS, Vite, Webpack, Astro, Next.js, GraphQL, Nuxt, or REST API design.
  Return one tip per response with a concise explanation, valid example code,
  official documentation references, and an optional practice challenge that
  can be scaffolded into a runnable project on request. Avoid repeating
  topics already covered in the current project by keeping a lightweight
  per-project coverage log (see Coverage Tracking below).
---

# Frontend Tip of the Day

This skill responds **only on demand** — it never generates a tip
proactively. Its only persistent state is the per-project coverage log
described below; scaffolding is performed only after the user explicitly
accepts the optional challenge.

## Trigger / When to Use

Activate only when the user explicitly asks for a frontend tip, a frontend
tip of the day, a frontend dev tip, or a tip about one of the supported
topics listed below.

- Do **not** generate a tip unprompted.
- If multiple topics are named, still return **exactly one tip**, using the
  first explicitly named topic.

## Topic Selection

- If the user names a supported topic, use that topic exactly.
- Do **not** repeat the same tip or technique previously given in the
  conversation or recorded in the project's coverage log.
- For an unspecified request, randomly choose one topic from the default
  list that has not previously been covered:
  `Vue, React, Angular, browser APIs, JavaScript, TypeScript, SCSS, CSS, Vite, Webpack, Astro, Next.js, GraphQL, Nuxt, REST API design`.
- Do not choose topics recorded in the conversation or in the project's
  coverage log unless every default topic has already been covered there.
- If all default topics have been covered, choose the
  least-recently-covered topic and state that the list has wrapped.
- If the coverage log is missing or unreadable, proceed as if nothing had
  been covered yet (do not fail the request).

## Tip Structure

1. Headline in the exact format `# Topic — Tip title`
2. Short explanation of the problem and why the technique helps
3. One or more syntactically valid, sufficiently self-contained fenced code
   examples with the correct language tag
4. Official documentation references
5. An optional practice challenge at the end

Include a version caveat whenever the tip depends on a specific version.

After delivering the tip, record it in the project's coverage log (see
Coverage Tracking below).

## Quality Bar

- Return **exactly one tip** per response.
- Keep prose to approximately 150–250 words, excluding code and links.
- Prefer official documentation domains.
- Never invent deep documentation URLs; use a stable official root or search
  page when uncertain.
- Ensure examples are valid and pasteable.

## Coverage Tracking (per project)

To avoid repeating topics across sessions, the skill keeps one small log
file **per project** at `.pi/frontend-tip-covered.md` inside the project
root.

Resolve the project root by running `git rev-parse --show-toplevel` from the
current working directory when the tip is requested. If that fails (not a
Git checkout), fall back to the current working directory itself.

- **Read** the log (if present) before selecting a topic, and skip topics
  already listed there.
- **Append** one line after each tip is delivered, in the format:

  ```markdown
  - 2025-09-03 | TypeScript | Satisfying discriminant unions with exhaustive switch
  ```

  i.e. `- <YYYY-MM-DD> | <Topic> | <Tip title>` (the title without the
  leading `# `). Parse the line by splitting on the **first two** `|`
  characters only; the title may itself contain `|`, while the topic always
  comes from the fixed topic list and never does. Do not add any other
  escaping.
- Create the file on first append with an `# Frontend Tips Covered` heading.
- The log lives under `.pi/`, pi's agent-state directory. If `.pi/` is not
  already git-ignored in the project, add it to the project's `.gitignore`
  (this is the one allowed exception to the "don't modify the user's
  project" rule below).
- Keep it minimal: one line per tip, no tip bodies, no curated content.
- If `.pi/` cannot be created or written (read-only directory), silently
  skip logging and continue.
- Never log outside the resolved project root's `.pi/` directory, and never
  maintain a global or cross-project tip history.

## Challenge Framing

End with a small, explicitly optional practice task. State that the user may
choose whether to attempt it and can request review of their solution, and
that the challenge can optionally be scaffolded into a runnable project (see
below) on request.

## Scaffolding the Challenge (optional)

When the user explicitly accepts the optional practice challenge:

1. Ask where to create the project if it matters (default: the current
   working directory). Never scaffold without explicit acceptance.
2. Resolve the absolute path of this skill's starter templates
   (`skills/frontend-tip/templates/` in the pi-setup repo). If unknown,
   locate them with a find for `frontend-tip/templates` (search `~/.pi` and
   your development folders); if not found, ask the user where pi-setup is
   installed.
3. Target directory: `frontend-tip-challenges/<topic>-<slug>/` where
   `<slug>` is the tip title lowercased, kebab-cased, non-alphanumerics
   stripped.
4. Decide which challenge-specific files the challenge needs beyond the
   starter template — e.g. a test harness, fixture data, a starter
   component, or a hints file.
5. Select the topic-appropriate starter template and copy it into the target
   directory. Add the challenge text, example code, and any challenge-specific
   files (such as fixtures, a starter component, or a hints file) to its README
   or source files.
6. Pin dependency versions when adding packages, run `npm install`, and verify
   the starter builds. Do not implement the challenge; leave that work for the
   user.
7. Report the created files, build status, and how to run (`cd <dir> && npm run
   dev`). State explicitly that the challenge itself is left for the user to
   complete.


## Do Not

- Do not provide multiple tips or a digest.
- Do not deliver tips proactively.
- Do not maintain a curated tip list or a global/cross-project history; the
  only persisted state is the per-project `.pi/frontend-tip-covered.md` log.
- Do not scaffold unless the user explicitly accepts the optional challenge.
- Do not modify the user's project outside the challenge directory — the
  only exceptions are the coverage log (and its `.pi/` directory) and, if
  missing, the one-line `.gitignore` entry for `.pi/`.
- Do not invent documentation URLs.
