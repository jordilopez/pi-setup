# CDP Extension

Chrome DevTools Protocol browser automation (namespace `cdp`) — tools like
`cdp_connect`, `cdp_goto`, `cdp_query`, `cdp_eval`, `cdp_screenshot`, plus
`/cdp:connect` · `/cdp:disconnect` · `/cdp:console` · `/cdp:viewport` commands.
No puppeteer; it drives CDP's WebSocket debugger endpoint directly.

Only `index.ts` is auto-loaded by Pi from this directory; everything else is
internal structure.

## Layout (hexagonal / ports & adapters)

```text
extensions/cdp/
├── index.ts                # entry: parse --port, call registerCdpTools
├── ports/
│   ├── transport.ts        # CdpTransport
│   └── fs.ts               # PathFs
├── domain/                 # pure/port-driven, no WebSocket/fs/pi
│   ├── request-tracker.ts  # pending-request ids, timeout, bump-invalidation
│   ├── console-format.ts   # formatConsoleApiCall + truncation bound
│   ├── console-store.ts    # bounded console ring buffer
│   └── path-guard.ts       # screenshot write-path safety policy
└── adapters/pi/            # the only WebSocket/fs/pi-aware code
    ├── web-socket-transport.ts # WebSocketCdpTransport (implements CdpTransport)
    ├── node-fs.ts          # NodePathFs
    ├── tools.ts            # createCdpTools(...) — the 11 tools
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
  - `path-guard.ts` — `validateScreenshotPath`, the write-path safety policy:
    lexical prefix check, `realpath` parent check, final-component `lstat`
    symlink refusal. Filesystem calls are injected via the `PathFs` port; only
    `node:path` (pure string ops) is used directly, which is the documented
    carve-out in the git pilot's purity rule.
- **`ports/`** declares `CdpTransport` (connect/send/close + console/connect
  subscriptions) and `PathFs` (`realpath`, `lstat`).
- **`adapters/pi/`** implements them: `WebSocketCdpTransport` owns the
  WebSocket/fetch plumbing and the socket-generation counter; `NodePathFs`
  wraps `node:fs`; `tools.ts`/`register.ts` register the tools, commands, and
  lifecycle hooks.

## The generation counter

The WebSocket transport keeps a generation counter so that a stale socket's
`onopen`/`onmessage`/`onclose` can never null out or reject state belonging to
a newer connection. This is distinct from request invalidation: requests are
invalidated by `RequestTracker.bump()`, which clears the pending map (ids are
never reused), so stale-socket responses become no-ops on their own.

## Testing

- `tests/request-tracker.test.ts` — id allocation, resolve/reject, timeout,
  bump-invalidation, stale-id no-ops.
- `tests/console-store.test.ts` — formatting + bound eviction + clear.
- `tests/path-guard.test.ts` — all four rejection branches + the ENOENT
  tolerance, via a fake `PathFs`.
- `tests/pi-executor.adapter.test.ts` / `tests/pi-ui.adapter.test.ts` are the
  git extension's adapter tests; CDP's adapter tests cover the equivalent seams.

Run everything with `npm run test`.
