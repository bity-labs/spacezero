# ADR 0039: Use Host-owned Project Session agent runtime configuration

## Status

Accepted

## Context

Project Sessions currently run Pi through the Workspace Host, but the runtime path is still too turn-local for long-lived desktop workflows. The Host needs durable policy for model choice, thinking level, private Pi runtime state, compaction, retry, and follow-up semantics without exposing Pi SDK objects or transferring authority to Pi session storage.

ADR 0028 makes the Session Event Journal the Space Zero product source of truth. ADR 0029 gives each Project Session one Pi conversation and one managed worktree. This decision clarifies how richer Pi Core capabilities fit behind those accepted boundaries.

## Decision

Space Zero will keep agent runtime policy Host-owned and Session-scoped.

- A Host-global default provider/model/thinking preference may seed new Project Sessions.
- Each Project Session owns durable runtime configuration for selected provider/model and default thinking level.
- Every admitted turn snapshots its effective runtime configuration before execution.
- Model catalogs exposed through Host Protocol are sanitized descriptors only; provider credentials, auth paths, provider headers, raw Pi model records, and Pi types remain private.
- Thinking levels use Space Zero-owned contract values even when they match Pi's current strings.
- Workspace Host owns context-budget policy, compaction timing, retry eligibility, queue ordering, cancellation, and recovery decisions.
- Pi Adapter owns Pi-specific execution mechanics, model resolution, thinking validation, compaction primitives, event translation, and private runtime/session state.
- Queued guidance and follow-up semantics, when implemented, will use Space Zero product language and durable queue records rather than making Pi's in-memory queues authoritative.
- Additional prompt submission while an active turn is running remains an explicit rejection until the durable queue is implemented.

## Rationale

The desktop product needs deterministic, recoverable Session behavior and clear client-safe errors. Pi Core provides useful mechanisms, but its objects, transcripts, provider payloads, and in-memory queues are not stable Space Zero contracts. Keeping policy in the Host preserves the security boundary and lets the renderer consume plain projections while still allowing Pi Adapter to use Pi Core capabilities internally.

## Consequences

- Host Contracts need runtime configuration and model catalog endpoints before user-selectable models ship.
- Project Session migrations must persist Session runtime selection, revision, and per-turn effective snapshots.
- Pi Adapter must resolve and validate model/thinking choices immediately before each turn and fail without silent fallback.
- Compaction summaries and private Pi state are sensitive and must not enter ordinary Session events, SSE, renderer state, logs, telemetry, or support bundles.
- Queue, retry, and recovery implementations must preserve the no-ambiguous-replay rule from ADR 0035.

## Alternatives Considered

- **Use only a process-wide runner model** — rejected because Sessions could not be restored or reproduced with deterministic runtime configuration.
- **Expose Pi session/runtime objects directly to clients** — rejected because it leaks implementation details and sensitive provider data across Host Protocol.
- **Let Pi queues and transcripts become the durable product authority** — rejected because they do not own Space Zero command idempotency, approvals, cursors, worktree identity, or recovery semantics.
- **Build a separate Host summarizer before using Pi compaction** — rejected initially because Pi Core already provides compaction primitives and duplicate summarization policy would increase divergence.

## Review Trigger

Revisit this decision if Pi exposes a stable, client-safe, durable execution protocol that can prove recovery without leaking provider state, or if multi-harness support requires a Host-owned abstraction that cannot be satisfied by the current Pi Adapter boundary.
