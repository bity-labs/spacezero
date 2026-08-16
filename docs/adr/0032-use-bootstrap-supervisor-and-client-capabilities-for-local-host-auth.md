# ADR 0032: Use bootstrap, supervisor, and client capabilities for Local Host authorization

## Status

Accepted

## Context

The Local Host is a privileged loopback service that can run agents, modify Session worktrees, execute Git operations, and access durable Session state. Loopback binding prevents network exposure by default but does not authenticate local processes.

The React renderer must use the same HTTP/SSE Host Protocol intended for future web and Companion App clients. Making Electron main proxy every Session operation would recreate an Electron-specific product path. Giving the renderer a Host-administration credential would violate least privilege because the renderer processes project content, agent output, Markdown, diffs, and future embedded content.

The Local Host therefore needs a secure startup proof and separate administrative and ordinary-client authority.

## Decision

Local Host startup and client authorization use three credential stages:

1. a one-time bootstrap secret;
2. a Host-lifetime supervisor capability; and
3. short-lived scoped client capabilities.

All credentials are bearer capabilities whose concrete token encoding remains an implementation detail. Possession grants only the scopes and Host-instance audience encoded or recorded for that capability.

### One-time bootstrap

Electron main generates a cryptographically random bootstrap secret before starting the private-Node Local Host.

Desktop passes bootstrap configuration over an inherited operating-system pipe/file descriptor or equivalently protected child-process channel. It never passes the secret through:

- command-line arguments;
- environment variables;
- URLs or query parameters;
- ordinary files;
- logs; or
- renderer IPC.

The Local Host accepts the bootstrap secret once, for the expected startup exchange, within a short bounded lifetime. Successful exchange or expiration invalidates it.

The Host binds initially to `127.0.0.1` on an operating-system-selected ephemeral port. It reports the selected endpoint, fresh Host instance ID, and protocol compatibility range to Electron main through the protected startup channel.

### Supervisor capability

A successful bootstrap exchange creates a supervisor capability held only in Electron main memory for the lifetime of that Local Host instance.

Supervisor authority is limited to Local Host administration needed by Desktop, including:

- verifying Host identity and compatibility;
- minting or renewing ordinary client capabilities;
- reading bounded administrative diagnostics;
- coordinating orderly shutdown; and
- invoking explicitly designed recovery administration.

The supervisor capability is never exposed to the renderer, persisted in browser storage, or included in URLs, logs, Session events, transcripts, or workspace files. Host restart invalidates it.

### Client capability

Electron main uses supervisor authority to request short-lived client capabilities and passes them to the renderer through the narrow preload API.

A client capability authorizes only ordinary Host Protocol operations granted by its scopes, such as:

- Session queries;
- Session commands;
- authorized event subscription; and
- other explicitly registered builder-facing capabilities.

It cannot mint capabilities, change Host authorization policy, access secrets or raw persistence, or perform supervisor administration.

The renderer and Client Runtime hold client capabilities only in memory. When renewal is needed, the renderer requests it through preload; Electron main uses its supervisor capability to obtain a replacement. The renderer never receives the supervisor capability.

Every Host command, query, and SSE subscription validates capability signature or lookup, expiry, scope, Host instance audience, and operation authorization. Unknown, expired, incorrectly scoped, replay-invalid, or instance-mismatched credentials fail closed.

### Health, origin, and exposure

An unauthenticated health endpoint may reveal only minimal liveness and protocol compatibility information needed before authorization. Detailed version, diagnostics, Session, and capability information requires authorization.

The Local Host validates allowed request origins and does not use wildcard CORS. Packaged Desktop and development origins are explicit. Bearer capabilities travel only in the `Authorization` header; native `EventSource`, URL tokens, and persistent browser authentication storage are not used.

### Remote alignment

Future Remote Hosts use the same short-lived scoped client-capability semantics after authentication. Their issuance path differs:

- Local Host clients derive authority through Desktop bootstrap and supervisor capability.
- Remote clients derive authority through future account, device-pairing, and control-plane flows over TLS.

Remote infrastructure has its own administration boundary; Companion App and web clients receive ordinary scoped client capabilities rather than Local Host supervisor authority.

## Rationale

The three stages separate process-launch proof, Host administration, and ordinary client access. A renderer compromise remains serious but does not automatically grant capability issuance or Host administration, and a short-lived renderer credential limits useful exposure.

Direct renderer-to-Host HTTP/SSE preserves one product protocol across Desktop and future clients. Electron main remains responsible only for trusted local bootstrap, capability renewal, and native Host lifecycle.

An inherited process channel avoids exposing bootstrap credentials through operating-system process listings, environment inspection, logs, or renderer-accessible state.

## Consequences

- Desktop, preload, Client Runtime, and Host require an explicit capability lifecycle.
- Local Host startup requires protected bidirectional readiness/bootstrap communication in addition to HTTP/SSE.
- Renderer reload discards its client capability and requests another through preload.
- Host restart invalidates supervisor and client capabilities and requires a fresh bootstrap.
- Authorization tests must cover expiry, scope denial, instance mismatch, replay, renderer reload, Host restart, malformed headers, and origin rejection.
- Future remote token issuance can differ internally without changing client authorization semantics.

## Alternatives Considered

- **Trust loopback without authentication** — rejected because any local process can reach loopback and the Host is highly privileged.
- **One shared token for Electron main and renderer** — rejected because renderer compromise would grant Host administration and capability issuance.
- **Proxy all Host traffic through Electron main** — rejected because it creates an Electron-specific product path and prevents Client Runtime from exercising the future remote protocol directly.
- **Persist the supervisor or client token** — rejected because Host restart and renderer reload should reduce credential lifetime rather than leave reusable disk credentials.
- **Pass bootstrap secrets in arguments, environment, URLs, or files** — rejected because those channels are commonly observable or persist beyond the intended exchange.
- **Use cookies for renderer authorization** — rejected initially because in-memory scoped bearer capabilities avoid cookie-origin and CSRF policy and align with future non-browser clients.

## Review Trigger

Revisit this decision if:

- supported clients cannot safely hold short-lived bearer capabilities in memory;
- a browser platform requires a different SSE authentication mechanism;
- Local Host administration grows beyond a narrow Desktop lifecycle surface;
- remote pairing introduces proof-of-possession requirements that should also apply locally; or
- security review demonstrates that direct renderer-to-Host access creates unacceptable risk despite scoped authorization and origin validation.
