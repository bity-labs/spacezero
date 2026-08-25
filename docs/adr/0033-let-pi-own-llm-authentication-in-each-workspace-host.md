# ADR 0033: Let Pi own LLM authentication in each Workspace Host

## Status

Accepted

## Context

The Workspace Host runs Pi through the Pi Adapter. Pi already provides authentication storage and behavior for provider API keys, OAuth credentials, file locking, permissions, and token refresh.

Moving LLM credentials into Desktop `safeStorage` would require a new credential broker and custom Pi authentication adapter before the initial Project Session needs one. LLM credentials are agent-runtime configuration rather than Project Session event state.

Future Remote Hosts will need provider credentials, but secure transfer and Remote Host secret lifecycle depend on infrastructure that is deliberately deferred.

## Decision

Pi owns LLM provider authentication through its normal authentication storage inside each Workspace Host.

For the Local Host:

- Pi authentication data lives under the Local Host's private operating-system application-data directory;
- Pi Adapter is the only Host boundary that accesses Pi authentication implementation details;
- credentials are Host-global rather than Project- or Session-specific;
- Pi retains responsibility for supported locking, restrictive file permissions, OAuth refresh, and provider configuration behavior; and
- credentials are not mirrored into Space Zero SQLite.

The Host Protocol may expose narrowly scoped authentication operations and non-secret status, such as adding or removing an API key, starting an OAuth flow, reporting whether a provider is authenticated, and listing available models. Secret values are accepted only through authenticated commands and are never returned to clients.

A renderer may hold user-entered secret text transiently while submitting it, but it must not persist that value in browser storage, application state persistence, logs, diagnostics, or analytics.

LLM credentials must never enter:

- Project Session events or projections;
- Pi conversation transcripts;
- Project worktrees or Git commits;
- agent tool inputs or ordinary process environments;
- command-line arguments or URLs;
- application logs or telemetry; or
- Desktop settings databases.

OAuth browser opening and deep-link handling may use Desktop-native capabilities, but callback material routes through authenticated boundaries to the Host-side Pi authentication flow. Electron main does not become the durable owner of LLM credentials.

### Future Remote Hosts

Each Remote Host will maintain its own private Pi authentication storage.

A later security decision may allow a builder to transfer selected provider credentials explicitly from the Local Host's Pi configuration to an authorized Remote Host. That design must use authenticated encrypted transport, explicit user intent, bounded destination identity, redaction, and Remote Host retention/deletion rules.

Credential transfer is not part of initial Session Handoff and must never use Session events, conversation history, Git, project files, URLs, logs, or plaintext control-plane storage. The exact transfer protocol, whether credentials persist on On-demand versus Dedicated Remote Hosts, and revocation behavior remain undecided.

GitHub, license, Host-client, and future Space Zero account credentials are separate systems and are not stored in Pi authentication storage.

## Rationale

Using Pi's existing authentication behavior keeps credential ownership next to the runtime that consumes it and avoids duplicating provider-specific OAuth, refresh, locking, and storage logic. It also preserves an independently runnable Workspace Host without a reverse runtime dependency on Electron main.

Keeping Pi authentication outside SQLite and Session history prevents secret data from entering event replay, projections, backups, and client protocol payloads.

Deferring Remote Host credential transfer avoids inventing a security protocol before the Remote Host infrastructure and threat model exist.

## Consequences

- The private Host application-data directory becomes security-sensitive and must use restrictive permissions and redacted diagnostics.
- Local Host backup or migration must not accidentally include credentials without explicit policy.
- Pi authentication storage format remains an adapter detail and is not a Space Zero client contract.
- A Remote Host cannot execute a provider-backed Session until that Host is authenticated for the selected provider.
- Future credential transfer requires a dedicated security review and ADR.
- Removing a Project Session does not remove Host-global provider credentials.

## Alternatives Considered

- **Store LLM credentials in Desktop `safeStorage` and broker them to the Host** — rejected initially because it adds a reverse dependency and custom credential service around Pi before a concrete need.
- **Store provider credentials in SQLite** — rejected because Session/product persistence should not duplicate Pi authentication or expose secrets to event and projection tooling.
- **Use environment variables as the primary persistent mechanism** — rejected because they are easy to leak through process inspection, child environments, diagnostics, and tool execution.
- **Copy the entire Local Pi auth configuration automatically to Remote Hosts** — rejected because destination trust, provider selection, encryption, retention, and revocation require explicit design and user consent.

## Review Trigger

Revisit this decision if:

- Pi authentication storage cannot meet local permission or refresh requirements;
- public distribution requires stronger encryption at rest than Pi provides;
- Remote Host credential transfer is selected for implementation;
- enterprise policy requires operating-system keychain or external secret-manager integration; or
- Pi's authentication APIs change enough that Space Zero needs a stable Host-owned credential abstraction.
