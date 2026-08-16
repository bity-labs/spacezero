# ADR 0027: Use Effect across the Workspace Host architecture

## Status

Accepted

## Context

Space Zero's Workspace Host must coordinate long-running agent execution, cancellation, resource cleanup, SQLite transactions, authenticated HTTP commands, SSE streams, retries, typed failures, and multiple runtime adapters. Host Contracts also need one runtime-validation source for commands, queries, events, projections, and errors.

The same concerns appear in the browser-safe Client Runtime: authenticated requests, stream consumption, reconnection, cursor catch-up, retries, token lifecycle, and projection updates.

Effect provides schemas, typed errors, services and Layers, scoped resources, structured concurrency, interruption, streams, schedules, and testable dependency composition. OpenCode's current architecture demonstrates that Effect can support an event-sourced agent server, but Space Zero should adopt Effect for its own requirements rather than copy OpenCode's modules or universalize Effect into UI code.

## Decision

Space Zero will use **Effect 4** as the application foundation across these boundaries:

- `packages/host-contracts`;
- `apps/workspace-host`;
- `packages/pi-adapter`; and
- `packages/client-runtime`.

React components and generic UI packages remain Effect-free. They consume plain serializable projection snapshots, status values, and callback or command interfaces supplied by application containers.

### Host Contracts

Host Contracts use Effect Schema as the source of runtime-validated definitions for:

- commands and command results;
- queries and query results;
- durable and live events;
- Session projections;
- stable Space Zero error codes and payloads;
- authentication capability metadata; and
- protocol compatibility metadata.

Contracts remain serializable and browser-safe. They do not import Electron, React, Node filesystem/process APIs, Pi SDK types, database implementations, or Host services.

### Workspace Host

The Workspace Host uses Effect for:

- application services and dependency composition through Layers;
- typed domain and infrastructure errors;
- scoped startup, shutdown, and resource cleanup;
- Session execution coordination and interruption;
- SQLite transactions and persistence adapters;
- durable event publication and projection;
- HTTP handlers and authenticated SSE streams;
- retries, schedules, timeouts, and cancellation policy; and
- composition of Pi, Git, filesystem, clock, identity, and transport adapters.

Pure domain reducers, schemas, and projectors should remain pure functions where Effect provides no value. Not every helper or data transformation needs to return an Effect.

### Pi Adapter

The Pi Adapter presents Pi capabilities as narrow Effect services. It translates Pi promises, streams, events, failures, and cleanup into stable Host-facing concepts. Pi SDK types and raw events do not escape into Host Contracts or client code.

### Client Runtime

The browser-safe Client Runtime uses Effect internally for:

- HTTP commands and queries;
- authenticated streaming `fetch()` and SSE decoding;
- retry and reconnect schedules;
- cursor catch-up and event deduplication;
- short-lived capability lifecycle;
- connection state; and
- in-memory projection updates.

The Client Runtime exposes a small framework-neutral boundary so React does not need to execute Effects directly or store Effect runtime objects in component state.

### Version policy

Space Zero uses the Effect 4 release-candidate line. The implementation baseline pins `4.0.0-rc.109` across Effect core, platform, SQL, testing, and related packages. Version ranges and independently drifting Effect package versions are not allowed.

Effect upgrades are dedicated changes that include typecheck, unit, integration, real-SQLite, Host protocol, Electron, and packaged Local Host validation. The project does not track every release candidate automatically.

When Effect 4 reaches stable, migration from the pinned release candidate is handled as an explicit validated upgrade rather than assumed compatible.

### Platform and unstable APIs

Effect HTTP, SSE, database, or platform integrations are infrastructure details. Unstable APIs must be isolated behind narrow adapters. Domain services and Host Contracts must not depend on unstable transport-specific types.

The project will pin compatible Effect package versions and update them deliberately. It will not introduce parallel schema definitions in another validation library unless an external boundary requires generated compatibility artifacts.

## Rationale

Effect addresses multiple difficult requirements together: runtime validation, typed failures, resource safety, structured concurrency, interruption, streaming, retries, and dependency composition. Applying it consistently across Host Contracts, Host, Pi Adapter, and Client Runtime avoids incompatible local conventions at every asynchronous boundary.

Keeping React and generic UI Effect-free preserves ordinary component composition and prevents infrastructure/runtime concerns from spreading through the renderer tree.

Using Effect Schema as the contract source reduces drift between static TypeScript types and runtime validation. Isolating platform adapters keeps Effect's broader value without coupling domain policy to unstable HTTP or database APIs.

## Consequences

- Effect `4.0.0-rc.109` becomes an approved, exact-pinned runtime dependency for the Host architecture and Client Runtime.
- Release-candidate and unstable API changes are absorbed through deliberate workspace-wide upgrades and adapter boundaries.
- Engineers and agents working in these packages must follow consistent Effect service, error, Layer, scope, and testing conventions.
- Repository tooling must prevent multiple incompatible Effect versions.
- Contract schemas can drive runtime decoding and, where needed, generated protocol documentation.
- React application containers must translate Client Runtime state into plain UI-facing data and commands.
- Pi integration, SQLite, HTTP, and SSE require adapters rather than leaking provider types into domain code.
- Initial implementation carries a learning and abstraction cost that must be controlled through narrow modules and concrete vertical slices.

## Alternatives Considered

- **Use Effect only for SSE** — rejected because SSE alone does not justify the dependency and would create an isolated programming model.
- **Use Effect only in Workspace Host** — rejected because Host Contracts and Client Runtime share runtime validation, streaming, retry, and resource concerns.
- **Use promises plus Zod and ad hoc event emitters** — viable for a smaller local-only application, but it would require separate conventions for errors, cleanup, cancellation, retries, streams, and dependency injection across the remote-ready Host boundary.
- **Expose Effect directly to React components** — rejected because UI composition should remain framework-ordinary and infrastructure-independent.
- **Copy OpenCode's Effect architecture** — rejected because OpenCode is evidence for the approach, not Space Zero's module or domain specification.

## Review Trigger

Revisit this decision if:

- Effect materially obstructs browser, mobile, Electron, or packaged Host compatibility;
- unstable APIs leak beyond adapters despite enforcement;
- Effect 4 release-candidate or unstable-module churn creates unacceptable implementation or maintenance cost;
- the runtime introduces unacceptable bundle, startup, debugging, or maintenance cost; or
- concrete implementation evidence shows simpler TypeScript primitives provide stronger reliability for these boundaries.
