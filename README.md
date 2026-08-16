# Space Zero

Space Zero is a local-first desktop interface for directing Pi-powered coding agents. The active `v0.1` line is a clean rebuild around a standalone, remote-ready Workspace Host and a polished desktop client.

## Status

The repository currently contains the planned monorepo boundaries and architecture documentation only. Applications, packages, workspace tooling, and release automation will be introduced incrementally through verified vertical slices.

The previous implementation is preserved on the `v0` branch.

## Planned repository shape

```text
apps/
  desktop/          Electron shell and first Space Zero client
  workspace-host/   Headless Pi-powered workspace service
  handbook/         Private Fumadocs engineering handbook
packages/
  host-contracts/   Stable client/host protocol
  client-runtime/   Shared connection and projection behavior
  pi-adapter/       Boundary around the Pi SDK
  ui/               Browser-safe React components and Storybook
scripts/            Repository automation
tests/              Cross-application and packaged-system verification
```

Each placeholder directory contains a README describing its intended responsibility. A directory becomes an implementation workspace only when the active delivery slice requires it.

## Documentation

- `docs/` is the normative source of truth for agents and engineering work.
- `apps/handbook/` will explain the system as a private, human-oriented Fumadocs site.
- `.agents/` contains reusable agent workflows.
- `AGENTS.md` defines repository navigation and working rules.

The retained V1 documentation is being audited. ADR status, coding standards, architecture guidance, and skills must not be assumed to describe v0.1 until they have been explicitly retained, amended, or superseded.
