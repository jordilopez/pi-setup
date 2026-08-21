---
name: frontend-tip
description: >-
  Generates one fresh frontend development tip on demand. Use when the user
  explicitly asks for a frontend tip, a frontend tip of the day, a frontend
  dev tip, or a tip about Vue, React, Angular, browser APIs, JavaScript,
  TypeScript, SCSS, CSS, Vite, Webpack, Astro, Next.js, GraphQL, or Nuxt.
  Return one tip per response with a concise explanation, valid example code,
  official documentation references, and an optional practice challenge that
  can be scaffolded into a runnable project on request. Do not maintain a
  curated list or persist state.
---

# Frontend Tip of the Day

This skill responds **only on demand** — it never generates a tip
proactively. It writes no files itself and persists no state; scaffolding is
performed only after the user explicitly accepts the optional challenge.

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
  conversation.
- For an unspecified request, randomly choose one topic from the default
  list that has not previously been covered:
  `Vue, React, Angular, browser APIs, JavaScript, TypeScript, SCSS, CSS, Vite, Webpack, Astro, Next.js, GraphQL, Nuxt`.
- Do not choose topics previously covered in the conversation unless every
  default topic has already been covered.
- If all default topics have been covered, choose the
  least-recently-covered topic and state that the list has wrapped.

## Tip Structure

1. Headline in the exact format `# Topic — Tip title`
2. Short explanation of the problem and why the technique helps
3. One or more syntactically valid, sufficiently self-contained fenced code
   examples with the correct language tag
4. Official documentation references
5. An optional practice challenge at the end

Include a version caveat whenever the tip depends on a specific version.

## Quality Bar

- Return **exactly one tip** per response.
- Keep prose to approximately 150–250 words, excluding code and links.
- Prefer official documentation domains.
- Never invent deep documentation URLs; use a stable official root or search
  page when uncertain.
- Ensure examples are valid and pasteable.

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
- Do not maintain a curated or persisted tip list.
- Do not scaffold unless the user explicitly accepts the optional challenge.
- Do not modify the user's project outside the challenge directory.
- Do not invent documentation URLs.
