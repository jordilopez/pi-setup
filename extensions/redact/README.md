# Redact Extension

Redacts sensitive data from `read` tool results. It registers no tool — it is
event-based: patterns from `~/.pi/agent/redact.json` are applied to `read`
results on the fly, re-read with mtime invalidation on every call so edits take
effect without a reload.

Only `index.ts` is auto-loaded by Pi from this directory (see the extension
loader discovery rules); everything else is internal structure.

## Layout (hexagonal / ports & adapters)

```text
extensions/redact/
├── index.ts          # entry point Pi loads — registers the handler
├── domain/           # pure logic: no node:fs/os, no runtime pi
├── ports/            # outbound interfaces the domain depends on
└── adapters/pi/      # the only fs/pi-aware code
```

Dependency direction is one-way:

```
adapters/pi/  →  ports/  ←  domain/
```

- **`domain/`** owns the policy and the transformation:
  - `pattern-safety.ts` — `isRegexSafe`, the conservative ReDoS guard;
  - `patterns.ts` — `compilePatterns`, the per-entry validation + safety caps;
  - `redactor.ts` — `redact(content, patterns)`, the text-block transform;
  - `loader.ts` — `createPatternLoader`, the mtime-invalidation cache with the
    last-known-good fallback and warn-once-per-change policy.

  The domain never reads the filesystem and never calls `pi.exec`; it receives
  config bytes through the `ConfigSource` port and emits warnings through the
  `WarnSink` port. One refinement to the git purity rule: `redactor.ts` imports
  `TextContent`/`ImageContent` **types only** from `@earendil-works/pi-ai`
  (erased at runtime) to preserve the exact `event.content` shape. No runtime or
  binding import of a pi package lives in `domain/`.

- **`ports/`** declares `ConfigSource` (config snapshot + mtime) and `WarnSink`
  (warning output). Interfaces only.
- **`adapters/pi/`** implements them — `FileConfigSource` over
  `node:fs`/`node:os`, `ConsoleWarnSink` over `console.warn` — and
  `registerReadRedaction` wires the `tool_result` handler together.

## Testing

- `tests/__support__/redact/fake-config-source.ts` — programmable `ConfigSource`.
- `tests/pattern-safety.test.ts` — ReDoS accept/reject cases.
- `tests/redactor.test.ts` — `compilePatterns` entry validation + `redact`.
- `tests/pattern-loader.test.ts` — mtime cache, last-known-good, warn-once.
- `tests/file-config-source.test.ts` + `tests/warn-sink.test.ts` — adapters.

Run everything with `npm run test`.

## Follow-ups

- `structuredContent` redaction. The Pi `tool_result` contract notes that
  handlers replacing `content` should also replace `structuredContent`; the
  current extension ignores it. Preserved as-is during the migration, tracked
  as a deliberate follow-up.
