# CDP Extension

Chrome DevTools Protocol browser automation (namespace `cdp`) — tools like
`cdp_connect`, `cdp_goto`, `cdp_query`, `cdp_eval`, `cdp_screenshot`,
`cdp_lighthouse`, plus `/cdp:connect` · `/cdp:disconnect` · `/cdp:console` ·
`/cdp:viewport` commands. No puppeteer; it drives CDP's WebSocket debugger
endpoint directly (Lighthouse is the one optional module, and it attaches to that
same endpoint — see [Lighthouse reports](#lighthouse-reports)).

Only `index.ts` is auto-loaded by Pi from this directory; everything else is
internal structure.

## Layout (hexagonal / ports & adapters)

```text
extensions/cdp/
├── index.ts                # entry: parse --port, call registerCdpTools
├── ports/
│   ├── transport.ts        # CdpTransport
│   ├── fs.ts               # PathFs
│   └── lighthouse.ts       # LighthouseRunner
├── domain/                 # pure/port-driven, no WebSocket/fs/pi/lighthouse
│   ├── request-tracker.ts  # pending-request ids, timeout, bump-invalidation
│   ├── console-format.ts   # formatConsoleApiCall + truncation bound
│   ├── console-store.ts    # bounded console ring buffer
│   ├── lighthouse-report.ts # param validation, flags, report naming, LHR summary
│   └── path-guard.ts       # write-path safety policy (screenshots, reports)
└── adapters/pi/            # the only WebSocket/fs/pi/lighthouse-aware code
    ├── web-socket-transport.ts # WebSocketCdpTransport (implements CdpTransport)
    ├── node-fs.ts          # NodePathFs
    ├── lighthouse-runner.ts # NodeLighthouseRunner (implements LighthouseRunner)
    ├── tools.ts            # createCdpTools(...) — the 12 tools
    └── register.ts         # registerCdpTools(pi, initialPort) + commands + lifecycle
```

Dependency direction is one-way:

```
adapters/pi/  →  ports/  ←  domain/
```

- **`domain/`** owns the three testable cores that were previously welded to
  the module state and WebSocket:
  - `request-tracker.ts` — `RequestTracker`: message-id allocation, the 30s
    timeout, and `bump()` invalidation on disconnect. Ids are never reused, so
    a message from a stale socket resolves into nothing and no-ops.
  - `console-store.ts` + `console-format.ts` — the bounded ring buffer
    (`MAX_CONSOLE_LOGS`) and message truncation (`MAX_CONSOLE_MSG_CHARS`).
  - `lighthouse-report.ts` — parameter validation, the `lighthouse()` flags
    mapping, report basenames, and the defensive LHR summarizer. Pure: the raw
    report is returned untouched, only the summary is derived.
  - `path-guard.ts` — `validateWritePath`, the shared write-path safety policy
    (screenshots and reports): lexical prefix check, `realpath` parent check,
    final-component `lstat` symlink refusal. Filesystem calls are injected via
    the `PathFs` port; only `node:path` (pure string ops) is used directly,
    which is the documented carve-out in the git pilot's purity rule.
- **`ports/`** declares `CdpTransport` (connect/send/close + console/connect
  subscriptions), `PathFs` (`realpath`, `lstat`), and `LighthouseRunner`
  (`run` one audit against a CDP port).
- **`adapters/pi/`** implements them: `WebSocketCdpTransport` owns the
  WebSocket/fetch plumbing and the socket-generation counter; `NodePathFs`
  wraps `node:fs`; `NodeLighthouseRunner` dynamically imports `lighthouse`;
  `tools.ts`/`register.ts` register the tools, commands, and lifecycle hooks.

## The generation counter

The WebSocket transport keeps a generation counter so that a stale socket's
`onopen`/`onmessage`/`onclose` can never null out or reject state belonging to
a newer connection. This is distinct from request invalidation: requests are
invalidated by `RequestTracker.bump()`, which clears the pending map (ids are
never reused), so stale-socket responses become no-ops on their own.

## Lighthouse reports

`cdp_lighthouse` runs a real Lighthouse audit **against the Chrome you are
already connected to** and writes the standard Lighthouse JSON (the LHR) to
disk. It exists so an audit can be consumed by the `web-performance-auditor`
persona without asking the user to paste a report or to run the Lighthouse CLI
by hand.

```text
cdp_lighthouse {
  url?: "https://example.com",      // default: the connected page
  device?: "mobile" | "desktop",    // default: mobile
  categories?: ["performance", "accessibility", "best-practices", "seo"],
  path?: ".lighthouse/run.report.json",
  includeHtml?: true,               // also write .report.html
  throttling?: "simulate" | "devtools" | "none",
  maxWaitForLoadMs?: 45000
}
```

Default output is
`.lighthouse/<timestamp>-<host-and-path-slug>-<device>.report.json` in the
project root. The tool returns the **path plus a ≤10-line summary** (scores, lab
metrics, failed-audit count, run warnings); the file holds all audits,
opportunities, and diagnostics. Never inline the report — an LHR is 1–3 MB.

Notable behavior:

- **Attach, don't launch.** `flags.port` points Lighthouse at the current CDP
  port, so no second Chrome starts and the user's page, viewport override, and
  console store are untouched. Lighthouse opens its own tab for the audit.
- **Desktop keeps your viewport** (`screenEmulation.disabled`); mobile uses
  Lighthouse's own device emulation. `device: "desktop"` with `throttling:
"simulate"` applies Lighthouse's desktop throttling profile.
- **Writes go through `validateWritePath`** — inside the project, parent
  directories created only after the lexical check, `O_NOFOLLOW` on open.
- **The module is optional at runtime.** `lighthouse` is a normal `dependency`
  (Pi installs it for npm/git package sources; a local checkout needs
  `npm install`), imported dynamically so a missing install never breaks
  extension load. If it is absent, the tool fails with the install command
  instead of downloading anything.
- **Hard timeout** at `maxWaitForLoadMs + 90s`. Lighthouse has no cancel API, so
  a timeout only stops the tool waiting; the run may still finish.

Manual smoke (no test fake for a live run):

```bash
chrome --headless=new --remote-debugging-port=9222 about:blank
cdp_connect                                 # then, in Pi:
cdp_lighthouse { device: "mobile", categories: ["performance"] }
```

If Lighthouse cannot be installed, the fallback is the CLI against the same
port: `npx lighthouse <url> --output json --port 9222 > report.json`, then hand
that file to the auditor.

## Testing

Tests live next to the source in `extensions/cdp/tests/`:

- `request-tracker.test.ts` — id allocation, resolve/reject, timeout,
  bump-invalidation, stale-id no-ops.
- `console-store.test.ts` — formatting + bound eviction + clear.
- `path-guard.test.ts` — every rejection branch for `validateWritePath` plus
  the screenshot wrapper's message shape, via a fake `PathFs`.
- `lighthouse-report.test.ts` — flag mapping (mobile/desktop × throttling),
  category and URL validation, report basenames, LHR summarization on a
  fixture and on malformed input, and the summary line budget.

The WebSocket transport adapter has no test fake (live `WebSocket` is the
contract). The same applies to `NodeLighthouseRunner`: `lighthouse` is obtained
through an injectable loader, but a run needs a real browser, so it is verified
by the smoke procedure below rather than a fake.

Run everything with `npm run test` (which globs `extensions/*/tests/*.test.ts`).
