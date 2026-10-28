# Git Extension

Browser... rather, git workflow tools for Pi: `/git:create-branch` (interactive
branch creation), `git_create_pr` (confirmed push + PR create/update), and
`git_prune_merged_branches` (confirmed deletion of local branches already merged
into the remote default branch).

Only `index.ts` is auto-loaded by Pi from this directory (see the extension
loader discovery rules); everything else is internal structure.

## Layout (hexagonal / ports & adapters)

```text
extensions/git/
├── index.ts          # entry point Pi loads — wires the three registrations
├── domain/           # pure logic: no pi, no node:fs, no node:os
├── ports/            # outbound interfaces the domain depends on
└── adapters/pi/      # the only pi-aware code; implements the ports
```

Dependency direction is one-way and enforced by convention:

```
adapters/pi/  →  ports/  ←  domain/
```

- **`domain/`** owns the decisions: branch-name policy, PR-state
  classification, merge-evidence fusion, confirmation/summary rendering, and
  the `run*Plan` flows that orchestrate validation → confirmation gate →
  side effects. It imports nothing from `@earendil-works/pi-coding-agent`,
  `node:fs`, or `node:os`, and calls `pi.exec` never. Every piece of I/O goes
  through a port, which is what makes the flows unit-testable without a live
  Pi session.
- **`ports/`** declares the contracts: `Executor` (subprocess runs),
  `Ui` (user interaction), `BodyFileStore` (temp file for the PR body).
  Interfaces only — no implementations, no pi imports.
- **`adapters/pi/`** implements the ports against Pi's API (`PiExecutor` over
  `ExtensionAPI.exec`, `PiUi` over `ctx.ui`, `TempBodyFileStore` over
  `node:fs/promises`) and registers the command/tools. Adapters are thin:
  build ports, call a `run*Plan` from `domain/`, render the result.

## Testing

Tests live next to the source in `extensions/git/tests/`:

- `extensions/git/tests/support/` holds the shared fakes — `FakeExecutor`
  (records calls, accepts a `setHandler`/`setDefault` program, models abort),
  `FakeUi` (records interactions, programmatic confirm/select/input answers),
  `FakeBodyFileStore` (tracks writes and disposals).
- Per-flow tests: `create-branch.test.ts`, `create-pr-plan.test.ts`,
  `prune-plan.test.ts`, plus pure-helper tests (`classify-pr-state.test.ts`,
  `prune-merged-branches.test.ts`, `create-pr-validation.test.ts`) and
  adapter delegation tests (`pi-executor.adapter.test.ts`,
  `pi-ui.adapter.test.ts`) and port-fake tests (`git-ports.test.ts`).

Run everything with `npm run test` (which globs `extensions/*/tests/*.test.ts`).

## Template for other extensions

This layout is the pilot for migrating `extensions/redact/` (would add
`ConfigSource` + `WarnSink` ports) and `extensions/cdp/` (would add
`CdpTransport` + `ConsoleLogStore` + `PathGuard`). When adding a tool here:

1. Put decisions and orchestration in `domain/` — pure, port-driven.
2. Declare any new side effect as a port in `ports/`.
3. Implement it in `adapters/pi/` and register the tool/command there.
4. Add a test driving the domain through the fakes in `extensions/git/tests/support/`.
