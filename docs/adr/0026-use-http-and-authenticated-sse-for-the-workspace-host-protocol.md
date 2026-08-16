# ADR 0026: Use HTTP and authenticated SSE for the Workspace Host protocol

## Status

Accepted

## Context

Space Zero Desktop communicates with a separately executable Local Host, and future clients will communicate with Space Zero-managed Remote Hosts. Local and remote execution must use the same domain protocol rather than creating an Electron-only path that is replaced later.

The protocol must support typed commands and queries, streaming agent activity, approvals and questions, structured errors, authentication, authorization, retries, reconnection, and future web and Companion App clients. Most live agent traffic is server-to-client. Interactive bidirectional Terminal traffic is not part of the initial implementation.

OpenCode demonstrates a useful transport split: HTTP for commands and queries, SSE for agent events, and WebSocket for PTY traffic. Its optional local authentication is not strong enough for Space Zero. T3 provides stronger reference patterns for short-lived client authorization, pairing, and remote trust, but its universal WebSocket RPC architecture is not required for the initial Host protocol. ADR 0027 selects Effect across the Host architecture for broader schema, service, resource, concurrency, and streaming benefits—not because SSE itself requires Effect.

## Decision

Space Zero will use:

- **HTTP with JSON payloads** for Workspace Host commands and queries;
- **authenticated Server-Sent Events (SSE)** for ordered Host and Project Session events; and
- a future specialized transport, likely WebSocket, only when a proven bidirectional streaming capability such as Terminal requires it.

Host Contracts define Space Zero domain commands, queries, events, projections, errors, and compatibility metadata independently of Electron and Pi. Raw Pi SDK types and events never cross the protocol boundary.

### Commands and queries

Mutating requests use explicit commands. Each retryable command carries a unique command ID so the Host can return the recorded outcome rather than repeat side effects.

A prompt command acknowledges accepted work without holding the HTTP response open for the complete agent turn. Agent output and lifecycle changes arrive through the event stream.

Queries return current Host or Session projections and include the durable event cursor through which that projection is current when catch-up semantics apply.

### Event stream and agent output

Clients subscribe to an SSE stream with a last-seen cursor. The Host sends ordered Space Zero events such as:

- turn started, completed, interrupted, or failed;
- message content updated;
- tool activity started or completed;
- approval requested or resolved;
- agent question requested or answered; and
- Session or changed-file state updated.

Agent text is streamed through batched message-content updates. The Host does not persist or publish every provider token as a separate domain event. It flushes meaningful updates on bounded time or size thresholds and at lifecycle boundaries.

Meaningful events are persisted before publication. After disconnection, a client loads an authoritative projection and resumes after its cursor rather than relying on the previous live stream.

### Authentication and authorization

Authentication is mandatory even when the Local Host binds only to loopback.

The initial client authorization model uses a short-lived, scoped bearer token held only in client memory:

- Electron main performs a one-time bootstrap exchange with the Local Host.
- Electron main provides the renderer/client runtime only the scoped client capability it needs.
- HTTP commands, queries, and SSE subscriptions authenticate with an `Authorization: Bearer ...` header.
- The SSE client uses streaming `fetch()` rather than native `EventSource`, because native `EventSource` cannot attach the required authorization header.
- Tokens never appear in URLs, logs, Session events, agent transcripts, workspace files, or persistent renderer storage.
- Host handlers enforce operation-level authorization rather than relying only on client UI controls.
- Unknown, expired, incorrectly scoped, or host-instance-mismatched credentials fail closed.

Future Remote Access uses the same short-lived scoped client-session concept over authenticated encrypted transport. Token issuance differs by environment:

- Local Host authorization begins with a secure Desktop-to-Host bootstrap exchange.
- Remote authorization will begin with future account, device-pairing, or control-plane flows.

The token's concrete representation is not part of the stable protocol contract. Local opaque capabilities and future remotely issued credentials may use different internal formats while presenting the same bearer authorization semantics to clients.

### Versioning

The Workspace Host protocol is versioned independently from the Desktop application version. Clients and Hosts negotiate compatibility before privileged operations.

Breaking semantic changes require an explicit protocol compatibility change. Additive changes may remain compatible when older clients can safely ignore them. Structured error responses use stable Space Zero error codes and do not expose provider payloads, credentials, or internal stack traces.

### Effect

Effect is the application foundation for Host Contracts, Workspace Host, Pi Adapter, and Client Runtime as decided in ADR 0027. The Host may implement HTTP and SSE using Effect streams and platform services behind a narrow transport adapter. Clients use streaming `fetch()` semantics regardless of the internal Effect implementation. Unstable Effect HTTP APIs must remain isolated so protocol contracts and domain services do not depend on them.

## Rationale

HTTP provides inspectable and well-understood request/response semantics for commands, queries, health checks, authentication, and version negotiation. SSE matches the dominant one-way flow of agent and Session events while supporting ordered event IDs and cursor resumption. Keeping Terminal out of this stream avoids adopting a universal bidirectional protocol before it is needed.

Short-lived scoped bearer capabilities provide one client authorization model across local and future remote environments without forcing both environments to issue credentials in the same way. Streaming `fetch()` avoids insecure URL credentials and the authorization-header limitation of native `EventSource`.

Effect supports the implementation with typed schemas, errors, resources, and streams, while transport-independent Host Contracts preserve the option to add another transport without exposing Pi or Electron details to clients.

## Consequences

- The Local Host initially binds to loopback and still requires authentication for every non-public operation.
- Desktop needs a secure one-time bootstrap path that does not expose bootstrap credentials through arguments, URLs, logs, or renderer persistence.
- The client runtime must implement streaming SSE parsing, reconnect behavior, cursor tracking, command IDs, and projection catch-up.
- The Host must implement authentication, scoped authorization, command deduplication, protocol compatibility, structured errors, and event publication.
- Agent answer streaming is decoupled from prompt HTTP request lifetime.
- A future Terminal can add WebSocket or another specialized transport without moving ordinary Session commands and events.
- Remote TLS, device pairing, account identity, relay/tunnel selection, token issuance, and revocation infrastructure remain later decisions.

## Alternatives Considered

- **Typed RPC over one WebSocket** — rejected initially because commands, responses, subscriptions, reconnection, and cancellation would require a larger RPC and multiplexing system without eliminating durable cursors or command idempotency.
- **Electron IPC for local Sessions and a network protocol later** — rejected because it creates separate local and remote integration paths and fails to exercise the remote-ready boundary locally.
- **Native `EventSource` with a token in the URL** — rejected because credentials can leak through logs, diagnostics, and copied URLs.
- **Cookie-authenticated SSE** — not selected initially because it introduces cookie-origin and CSRF policy when an in-memory bearer capability works consistently across clients.
- **Unauthenticated loopback server** — rejected because other local processes can reach loopback and the Host has filesystem, process, Git, and agent authority.

## Review Trigger

Revisit this decision if:

- a required capability needs sustained bidirectional traffic that HTTP commands plus SSE cannot handle cleanly;
- target remote infrastructure cannot reliably support authenticated streaming HTTP;
- browser or mobile platform constraints make streaming `fetch()` unsuitable;
- measured event volume or backpressure requirements exceed the selected stream model; or
- the selected Effect HTTP/SSE implementation creates unacceptable instability or interoperability constraints.
