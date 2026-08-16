# ADR 0037: Use Effect HttpApi and HTTP Client for the Host Protocol

## Status

Accepted

## Context

ADR 0026 selects HTTP/JSON for Host commands and queries and authenticated SSE over streaming `fetch()` for events. ADR 0027 selects Effect 4 across Host Contracts, Workspace Host, Pi Adapter, and Client Runtime.

Space Zero could define OpenAPI as the authoritative source and generate TypeScript clients and server types. That would provide a language-neutral contract, but static OpenAPI types would still require runtime validation and mapping into Effect errors, services, scopes, and Streams. Common OpenAPI tooling also does not fully express Space Zero's SSE resume and typed stream-failure semantics.

Effect 4 is currently a release candidate. Its HTTP and HttpApi modules are functional and include Node serving, typed clients, security, OpenAPI generation, and first-class SSE streams, but remain under `effect/unstable/*` and may change before or after Effect 4 stable.

## Decision

Space Zero uses the exact-pinned Effect 4 HTTP stack for the Host Protocol without adding Express, Fastify, Hono, or another web framework initially.

### Contracts

`packages/host-contracts` owns transport-safe Effect Schemas and HttpApi declarations for commands, queries, errors, authorization requirements, and SSE event streams.

Wire representations remain ordinary interoperable HTTP values:

- JSON objects and arrays;
- explicit HTTP methods and status codes;
- standard headers, including `Authorization`;
- stable structured error envelopes; and
- standard SSE `id`, `event`, and `data` fields.

Wire contracts must not serialize Effect runtime concepts such as `Cause`, `Exit`, `Option`, `Either`, Layers, service tags, fibers, or internal branded values. Internal typed failures are mapped to explicit public error schemas.

### Server

`apps/workspace-host` uses Effect's Node HTTP server and HttpApi handler facilities behind a narrow Host server adapter. Effect Layers own startup, request scopes, interruption, middleware, graceful shutdown, and server cleanup.

Authorization middleware validates Host instance audience, capability scope, expiry, origin, and operation access before invoking application services. Authentication policy remains a Space Zero service and does not depend on HttpApi middleware internals.

SSE endpoints use HttpApi's typed SSE streaming support where it satisfies the protocol contract. SSE framing, replay cursor, heartbeat, disconnect, backpressure, and authorization behavior remain Space Zero-owned semantics covered by conformance tests. A lower-level Effect HTTP route may replace only the SSE transport adapter if HttpApi streaming proves insufficient; this does not change the public Host Protocol.

### Client

`packages/client-runtime` uses Effect HttpApi Client and the Effect HTTP client abstraction. Browser execution provides the fetch-based HTTP client so authenticated SSE uses streaming `fetch()` with an `Authorization` header rather than native `EventSource`.

Client Runtime contains HttpApi and unstable HTTP types. React and generic UI receive plain projections, states, callbacks, and typed product errors rather than Effect HTTP implementation types.

### OpenAPI

HttpApi generates an OpenAPI representation as a derived build and documentation artifact. CI validates that generation succeeds and may perform compatibility diffs once the initial protocol baseline is published.

Generated OpenAPI is not initially the source of truth. It supports inspection, documentation, security review, and future non-TypeScript tooling. If third-party or non-TypeScript clients become a committed product requirement, Space Zero will reconsider OpenAPI-first ownership.

### Instability containment

All Effect packages use one exact workspace-wide Effect 4 release-candidate version. Host server startup, middleware, HttpApi declaration, generated client construction, and SSE codecs remain behind Space Zero-owned adapters and contract tests.

Effect upgrades are dedicated changes. They must validate JSON compatibility, authorization behavior, error encoding, SSE streaming and reconnect, generated OpenAPI, mock Host conformance, and real Host/Client Runtime integration.

## Rationale

Effect HttpApi lets one executable TypeScript contract drive runtime decoding, typed handlers, typed clients, security declarations, Streams, and OpenAPI generation. It avoids adding a second schema runtime and generated-source synchronization loop while all committed clients remain first-party TypeScript.

Keeping plain wire formats and adapter boundaries limits dependency on unstable Effect APIs. OpenAPI remains available as a derived interoperability artifact rather than being discarded.

## Consequences

- Host Contracts depend intentionally on Effect's unstable HttpApi modules.
- Workspace Host and Client Runtime need conformance coverage around every Effect upgrade.
- No additional web framework is added initially.
- Mock Host implements the same HttpApi/wire contracts used by the real Host.
- OpenAPI generation becomes a build/test concern.
- A future public API may require promoting OpenAPI or another language-neutral specification to authoritative status.

## Alternatives Considered

- **OpenAPI-first with generated server and client code** — deferred because initial clients are TypeScript, Effect Schema is already the runtime validation foundation, and SSE semantics would still require custom contracts and adapters.
- **Hono with Effect services** — rejected initially because it adds another routing and middleware model while Effect already supplies the accepted capabilities.
- **Native Node HTTP with hand-written parsing** — rejected because it duplicates routing, schema decoding, typed errors, client generation, and lifecycle behavior.
- **Expose Effect runtime values directly on the wire** — rejected because it would couple future clients and protocol compatibility to Effect implementation details.

## Review Trigger

Revisit this decision if:

- HttpApi instability causes repeated costly rewrites despite adapter containment;
- SSE behavior cannot satisfy resume, failure, backpressure, or authentication requirements;
- a committed third-party or non-TypeScript client requires an authoritative language-neutral contract;
- generated OpenAPI is too lossy for required gateway or security tooling; or
- another HTTP stack materially improves security, interoperability, or maintenance with acceptable integration cost.
