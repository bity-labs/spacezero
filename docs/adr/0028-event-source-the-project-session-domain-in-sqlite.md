# ADR 0028: Event-source the Project Session domain in SQLite

## Status

Accepted

## Context

Project Sessions must support durable conversation history, agent activity, approvals, questions, interruption, restart recovery, authenticated SSE replay, future Remote Access, and eventually execution on On-demand and Dedicated Remote Hosts.

Pi maintains its own transcript, but that transcript represents Pi runtime history rather than the complete Space Zero domain. It does not define stable client cursors, command idempotency, Host/workspace lifecycle, Space Zero approval state, or protocol-compatible events. Making clients depend on Pi storage would leak harness internals and make Space Zero recovery dependent on a format it does not own.

The archived v0 implementation used SQLite for product metadata and Pi storage for transcripts while meaningful runtime state was partly process-local. The v0.1 Host boundary provides an opportunity to make Project Session history and current state coherent across Host and client restarts.

OpenCode's developing V2 Session core provides supporting evidence for a bounded model: versioned durable events ordered per Session aggregate, relational projections, live-only high-frequency fragments, and replay from a Session sequence cursor. Space Zero needs the same class of guarantee but will define its own events around Project Sessions and Pi integration.

## Decision

Space Zero will event-source the **Project Session domain**. It will not event-source the entire application.

The Local Host owns one private SQLite database in the operating system application-data location. Within that database:

- a durable Session event table is the authoritative history of each Project Session;
- each Project Session is an event aggregate with a strictly increasing aggregate sequence;
- current Session projections are relational, query-optimized, and rebuildable from durable events;
- command receipts provide idempotency for retryable mutations; and
- projector progress and schema migrations are recorded explicitly.

SQLite uses `@effect/sql` and the exact Effect 4-compatible `@effect/sql-sqlite-node` adapter over `better-sqlite3`. It enables foreign keys and WAL, uses numbered transactional migrations, and keeps the driver behind a narrow Host persistence Layer. Database files, temporary files, and credentials never live inside Project worktrees.

### Driver and packaging

`@effect/sql-sqlite-node`, `better-sqlite3`, and the broader Effect package set use exact compatible workspace-wide versions. The native `better-sqlite3` binary targets the private pinned Node runtime's normal Node ABI rather than Electron's ABI.

Release builds produce and verify native artifacts for every supported platform and architecture. Headless Host integration tests use the real adapter and SQLite engine; SQL correctness and migrations are not validated only through mocks or string inspection.

The persistence Layer contains driver-specific types so event, Session, and protocol domains do not depend directly on `better-sqlite3`.

### Event-sourced scope

Durable Project Session events cover meaningful facts including:

- Session creation, lifecycle, failure, archival, and deletion facts;
- isolated workspace preparation, validation, cleanup, and recovery state;
- accepted user input and agent-turn lifecycle;
- user, assistant, system, and tool-visible message boundaries;
- tool calls, progress boundaries, outcomes, and failures;
- approval requests and resolutions;
- agent questions and answers;
- interruption and recovery decisions;
- relevant changed-file and Git/task-to-ship outcomes when those features are introduced; and
- future Session Handoff facts when that feature is designed.

Event schemas are defined and versioned through Effect Schema in Host Contracts or a referenced Session-domain schema package that remains client-safe.

### Non-event-sourced scope

The following remain conventional or external authorities:

- Desktop window, layout, update, and other client-local settings;
- credentials, authentication secrets, and capability tokens;
- Workspace Host infrastructure configuration;
- project filesystem contents;
- the Git object database and working tree;
- diagnostics and operational logs; and
- Pi's private runtime transcript and provider state.

Events may record validated facts about filesystem, Git, or Pi operations, but replaying Session events does not recreate those external systems. Recovery must reconcile recorded intent and outcome with current external state rather than silently repeat ambiguous side effects.

### Event commit and projection

For a successful command, the Host performs one SQLite transaction that:

1. validates the command and expected Session sequence or state;
2. detects a previously recorded command ID and returns its existing result when appropriate;
3. appends one or more versioned Session events;
4. applies deterministic projectors to relational projection tables;
5. records the command receipt and committed Session sequence; and
6. commits before any durable event is published to clients.

After commit, the Host wakes event subscribers. Durable rows—not in-memory wakeups—are the source of replay truth.

Projectors should be pure deterministic reducers where practical. Database projectors must be idempotent or protected by sequence progress and transaction boundaries. Projection rebuild tests must prove that replay produces the expected current state.

### Durable versus live streaming

Provider token fragments and transport heartbeats are not individual durable domain events.

The Host may publish ephemeral live deltas for responsive rendering. It also persists bounded, meaningful message-content checkpoints and always persists a full-value boundary on normal completion, interruption, or failure. Durable events advance the Session cursor; ephemeral events do not.

A reconnecting client loads a projection through a stated Session sequence and then replays durable events after that cursor. It never treats an ephemeral delta as a durable publication boundary.

### Pi transcript boundary

Pi transcripts remain private Pi Adapter data used for harness-level context and recovery. They are not Host Contracts and are not the client-facing source of truth.

Space Zero Session events and projections are authoritative for Space Zero product behavior. The Pi Adapter must reconcile Pi runtime state with the recorded Session state during restore and report ambiguity explicitly rather than inventing a successful outcome.

### Initial operational limits

The initial implementation uses synchronous projection within the event transaction and retains all meaningful Session events. It will not initially add:

- a generic event-sourcing framework beyond focused local modules;
- Kafka, a message broker, or distributed projector workers;
- event compaction or deletion;
- cross-Host event replication;
- live process migration; or
- event sourcing for unrelated product domains.

Snapshots, retention, archival, and compaction require later decisions based on measured Session histories and Remote Host requirements.

### Remote storage

SQLite is the accepted Local Host storage engine. It may also be suitable for Dedicated Remote Hosts with durable disks.

Future On-demand Remote Host infrastructure may require persistent volumes or another managed storage adapter. That decision may change the physical storage engine but must preserve Project Session event ordering, versioning, projection, idempotency, and replay semantics.

## Rationale

Project Session activity is the core history that builders and remote clients must trust. A bounded event-sourced model gives Space Zero stable domain history, deterministic current projections, replayable SSE cursors, approval recovery, command deduplication, and better visibility into partial failures.

Limiting event sourcing to Project Sessions avoids imposing event-model complexity on ordinary settings, credentials, filesystems, Git internals, or infrastructure configuration. SQLite keeps the initial Local Host self-contained and uses a persistence technology already proven in v0.

Separating durable boundaries from ephemeral high-frequency deltas preserves responsive streaming without creating one database write per model token.

## Consequences

- Project Session event schemas become durable compatibility contracts and require explicit versioning.
- Every Session mutation must define its events and projection behavior before implementation.
- Projection rebuild, duplicate command, ordering, migration, interruption, and crash-boundary tests are required.
- External side effects need explicit requested, succeeded, failed, or unknown/reconciliation states where ambiguity is possible.
- Pi transcript changes do not force client protocol changes, but Pi restore needs an explicit reconciliation adapter.
- SQLite write throughput and event growth must be measured before Remote Host concurrency expands.
- Native `better-sqlite3` artifacts, migrations, WAL, foreign keys, and restart behavior require packaged and real-database validation.
- Remote storage may later use a different implementation while retaining the accepted Session semantics.

## Alternatives Considered

- **Use only Pi transcripts** — rejected because they do not own the complete Space Zero Session domain or stable client protocol.
- **Store only current relational state plus a transient event bus** — rejected because reconnecting clients and post-crash recovery would lack an authoritative ordered Session history.
- **Use a transactional SSE outbox without authoritative Session events** — simpler, but it would preserve delivery history without providing full Session reconstruction and lifecycle reasoning.
- **Event-source the whole application** — rejected because most Desktop settings, credentials, filesystem data, Git state, and infrastructure configuration do not benefit from this model.
- **Persist every provider token as an event** — rejected because it creates excessive write volume and an unstable event vocabulary.
- **Use a non-Effect SQLite wrapper directly throughout Host services** — rejected because `@effect/sql-sqlite-node` integrates the accepted driver with Effect transactions, Layers, and typed failures while containing driver details.
- **Use SQLite mocks as the primary persistence test** — rejected because migration syntax, constraints, WAL, transactions, and native packaging require the real engine.
- **Select a distributed event database immediately** — rejected because the initial Local Host is one process with one local database and does not justify distributed infrastructure.

## Review Trigger

Revisit this decision if:

- projection rebuild cannot reproduce accepted Session behavior;
- SQLite contention or event volume fails measured Local or Dedicated Remote Host requirements;
- Pi recovery semantics fundamentally conflict with the Space Zero event model;
- On-demand infrastructure requires a storage model that cannot preserve aggregate ordering and transactional projection guarantees; or
- operational evidence shows the compatibility and migration cost exceeds the recovery and remote-supervision value.
