# ADR 0036: Test the Host boundary and run Electron UI E2E against a contract mock

## Status

Accepted

## Context

Space Zero v0 used Vitest, Testing Library, Playwright Electron, temporary Git repositories, adapter seams, and selected real-SQLite tests. Much privileged behavior nevertheless lived in Electron main, and large Electron E2E tests sometimes replaced IPC handlers or modified the application database directly to construct UI state.

The new architecture moves product and execution authority into a separately runnable Workspace Host reached through HTTP and SSE. Launching Electron, a real Host, SQLite, Git, Pi, and native modules for every screen or navigation test would make broad UI coverage slow and fragile. Bypassing the Host contract with renderer or IPC mocks would make those tests architecturally misleading.

## Decision

Space Zero keeps Vitest and Playwright while organizing tests around the accepted runtime boundaries.

### Unit and package tests

Vitest is the default TypeScript test runner. Packages use runtime-appropriate configurations rather than one repository-wide jsdom environment:

- Node environments for Host Contracts, Workspace Host, Pi Adapter, Client Runtime runtime behavior, Electron main, preload, and scripts;
- jsdom and Testing Library for React renderer behavior; and
- Effect-aware test utilities for Layers, scopes, interruption, clocks, retries, and resource cleanup.

Tests prefer public behavior and injected boundary adapters over private helper assertions or module patching.

### Real Workspace Host integration

Headless Host integration tests run without Electron through real HTTP and authenticated SSE. They use:

- temporary Host application-data directories;
- real `@effect/sql-sqlite-node` databases using private Node's built-in `node:sqlite`;
- real migrations, foreign keys, WAL, transactions, event append, and projection rebuilds;
- temporary Git repositories and managed worktrees; and
- deterministic Pi Adapter fakes for domain and protocol behavior.

Host Contracts provide shared conformance suites for request/response schemas, event envelopes, authorization failures, protocol compatibility, and Client Runtime decoding. The suites exercise both Host server and Client Runtime sides.

A narrow real-Pi compatibility suite verifies Pi Adapter construction, authentication storage wiring, conversation/resource setup, event translation, cancellation, and cleanup without requiring paid model calls. External model-provider calls are not part of normal CI.

### Mock-Host Electron E2E

The broad Electron UI E2E suite launches the real Electron shell, main process, preload, renderer, routing, and browser security configuration against a deterministic contract-compatible mock Workspace Host.

The mock Host communicates through the real HTTP/SSE transport and validates payloads with `packages/host-contracts`. It provides scriptable scenarios for:

- loading, empty, populated, streaming, and failure states;
- Project and Project Session workflows;
- interrupted, reconnecting, and recovery-required states;
- navigation, routing, keyboard shortcuts, and accessibility behavior; and
- stable visual fixtures for screenshot regression tests.

Tests must not replace renderer-facing IPC handlers with product-state fixtures or directly edit a real application's database to manufacture Host-owned state. Electron main may inject a mock Host launcher or endpoint only through an explicit test seam unavailable or fail-closed in production builds.

Screenshot tests pin viewport, scale, theme, fonts, fixture data, animation policy, and CI platform. Visual assertions remain targeted at meaningful screens and states rather than snapshotting every minor component variation.

### Real-Host Electron E2E

A smaller Electron integration suite launches the real Local Host and verifies only cross-process behavior that headless Host or mock-Host UI tests cannot prove, including:

- private Node launch and protected bootstrap;
- supervisor and client capability delivery;
- renderer-to-Host HTTP/SSE connectivity;
- Host-instance replacement, crash restart, and renderer reconnection;
- explicit Desktop quit and Host shutdown;
- native dialogs and other Electron-owned integration; and
- refusal to continue when Host startup, identity, authorization, or compatibility fails.

### Packaged smoke and release validation

Packaged tests verify the signed layout and runtime rather than only development builds. They cover:

- private Node `22.23.1` provenance, checksum baseline, presence, signing, and architecture;
- Workspace Host compiled ESM, production dependency tree, required assets, and integrity manifest;
- built-in `node:sqlite` availability/version, backup support, and database startup;
- Electron fuse and ASAR hardening;
- Host bootstrap and liveness from the packaged Desktop; and
- sanitized launch environment and canonical deployment paths; and
- signing/notarization structure where the environment permits verification.

## Rationale

The test center of gravity follows ownership. Host behavior is fastest and clearest through its public protocol with real persistence and Git, while renderer behavior is broadest and most deterministic against a contract-compatible mock Host.

Keeping a small real-Host Electron suite proves the process and security boundary without forcing every visual test to pay its cost. Exercising the mock through HTTP/SSE prevents a test-only IPC architecture from replacing the actual product contract.

## Consequences

- The repository needs a reusable mock Host that conforms to Host Contracts and supports deterministic scenarios.
- Vitest configuration is package/runtime aware.
- Host integration tests require temporary-directory, SQLite, Git, port, and process cleanup discipline.
- Electron E2E is split into broad mock-Host UI/visual coverage and narrow real-Host boundary coverage.
- Screenshot baselines require a pinned environment and deliberate review.
- Packaged smoke tests remain separate from ordinary development E2E where signing or architecture setup is expensive.
- CI can shard fast package tests, Host integration, mock-Host Electron E2E, real-Host Electron E2E, and packaged validation independently.

## Alternatives Considered

- **Run every Electron E2E against the real Host** — rejected because screen, navigation, and visual-state coverage would become unnecessarily slow and nondeterministic.
- **Mock preload IPC handlers to supply UI state** — rejected because the renderer's product path is Client Runtime over HTTP/SSE and such tests would preserve the obsolete v0 boundary.
- **Use only headless Host integration tests** — rejected because Electron navigation, preload, browser security, native behavior, and visual rendering still require the real shell.
- **Use only mocked SQLite or Git** — rejected because migrations, constraints, WAL, worktree identity, and cleanup correctness depend on real implementations.
- **Make real provider calls in ordinary CI** — rejected because cost, credentials, rate limits, and provider nondeterminism make them unsuitable for deterministic validation.

## Review Trigger

Revisit this decision if:

- mock Host scenarios drift from production despite shared conformance suites;
- Electron E2E runtime becomes too costly for practical CI feedback;
- screenshot variability cannot be controlled on supported CI platforms;
- Pi provides an official deterministic test runtime; or
- future web or Companion App clients justify extracting a cross-client UI conformance suite.
