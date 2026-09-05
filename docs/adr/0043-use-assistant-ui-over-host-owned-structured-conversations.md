# ADR 0043: Use assistant-ui over Host-owned structured conversations

## Status

Accepted

## Context

[Issue #541](https://github.com/bity-labs/spacezero/issues/541) explores a shared conversation UI for Project Sessions and Global Chat Sessions. The previous context required plain-props-only chat components. Reimplementing conversation interaction independently would duplicate behavior available in assistant-ui's runtime primitives.

Space Zero already owns its agent execution and history through Workspace Host, Pi Adapter, Host Protocol, and Client Runtime. Adopting a UI runtime must not introduce another durable conversation authority or replace the Host Protocol with a provider-specific chat transport.

Current conversation message contracts expose text, while separate events expose limited tool lifecycle metadata. Pi provides structured messages, readable reasoning where exposed by the provider, tool arguments, progress, and returned results, but the current Pi Adapter discards much of that information. A UI-only mapping cannot restore content that the Host never retained.

Project Sessions and Global Chat Sessions need the same conversation mechanics but have different creation, resource lifecycle, and authorization rules. The Host already shares turn execution under `features/chat-sessions`; this is a foundation to extend, not a reason to merge the entire Session domains.

This decision complements ADRs [0028](0028-event-source-the-project-session-domain-in-sqlite.md), [0033](0033-let-pi-own-llm-authentication-in-each-workspace-host.md), and [0042](0042-use-first-class-host-owned-global-chat-sessions.md). It replaces the plain-props-only chat UI restriction in project context; archived ADR 0007 remains historical reference rather than the active runtime choice.

## Decision

### Ownership and package boundaries

Space Zero will use assistant-ui's `useExternalStoreRuntime` for a shared runtime-backed conversation surface:

```text
Workspace Host / Pi Adapter
  ↕ authenticated Host Protocol
Client Runtime: plain conversation projection, subscriptions, commands
  ↕
Desktop React adapter: useExternalStoreRuntime
  ↕
AssistantRuntimeProvider → shared packages/ui Thread composition
```

- Workspace Host remains authoritative for durable messages, turns, tools, queue state, authorization, and recovery.
- Client Runtime loads saved history and combines durable events and live updates into one plain subscribable conversation projection. It owns synchronization and reconciliation, including opening a Session with a turn already running.
- Client Runtime stays independent of React and assistant-ui. Small Session-kind-specific connectors feed a shared conversation shape and behavior.
- One thin Desktop React adapter translates that projection and commands into assistant-ui messages, runtime status, and callbacks. It does not maintain another authoritative conversation history.
- The adapter initially belongs to Desktop. Extract it into a shared client UI adapter package only when another client, such as Web, needs it.
- `packages/ui` may depend on `@assistant-ui/react` and compose runtime-aware, domain-free Thread/message/composer elements. It does not import Space Zero domain services, Client Runtime, Effect, Electron, Node, or Pi.
- Session navigation, lists, headers, and resource-specific actions remain Desktop feature responsibilities. An assistant-ui Thread is the active conversation UI, not a new durable Session or Chat Context identity.
- assistant-ui does not execute tools, persist Session history, or communicate directly with Pi or the Host. Do not enable client-side tool execution for Host-owned tools.

### Shared Host conversation core

Share structured conversation content, turn execution, streaming, and reusable persistence/projection machinery between Project Sessions and Global Chat Sessions.

Keep Session creation, Project/worktree/Git lifecycle, resource cleanup, and tool authorization in the owning Session services. Sharing conversation mechanics does not require merging aggregates, storage tables, or all Session APIs.

Extend Pi Adapter and Host Contracts to expose Space Zero-owned serializable content parts with stable identities and order, including text, provider-exposed readable reasoning, tool calls and arguments, returned results, and outcomes. Preserve message/content boundaries rather than flattening an entire agent turn into one text string. Live tool progress remains distinguishable from final results.

Map all safely exposed conversation content that assistant-ui can represent. Content without a specialized visual renderer uses a safe generic fallback rather than silently disappearing. This does not invent missing upstream content or add unsupported commands.

### Complete conversation, not an unlimited output archive

Preserve the complete displayable conversation content Pi returns in Host SQLite, without additional Space Zero truncation or flattening. The Session Event Journal remains authoritative and projections remain rebuildable.

This is deliberately narrower than preserving every byte produced by an underlying tool:

- Pi's existing tool-output limits remain in effect.
- If a tool returns a truncated result, retain that result and communicate its truncation honestly.
- Do not initially copy Pi temporary output files into permanent storage or introduce a separate artifact store. Full underlying output referenced only by a temporary file is not guaranteed to remain available after reopening.
- Reopening a Session restores its retained structured conversation content, including readable reasoning and returned tool details.
- Public tool results retain returned text/images and explicitly supported display details, not raw Pi result objects or arbitrary metadata. Provider-private signatures, opaque/redacted reasoning payloads, and provider internals remain private or excluded.
- Project Session paths inside the authenticated managed worktree are represented relative to that worktree. Ordinary file references outside it may retain full absolute paths for useful debugging context. This narrowly qualifies ADR 0028's absolute-path restriction for displayable conversation content only: it grants no filesystem authority, does not authorize additional tool access, and does not expose canonical resource identities through control APIs.
- Credential-storage locations, Pi transcript locations, and temporary-output-file paths remain excluded even when embedded in returned content. Retain honest upstream truncation notices without exposing their private full-output paths. Apply path handling to recognized fields and known locations, not indiscriminate rewriting of slash-containing strings.
- Replace recognized protected secret values and explicit sensitive fields with `[redacted]` before durable public conversation storage or live publication. Use the same policy for retained history and streaming, including secret values split across deltas; filtering only in the renderer is insufficient. This targeted policy does not promise perfect detection of every secret in arbitrary text and does not grant generic conversation services or clients access to Pi credential storage.
- Stream updates in memory and persist bounded-frequency content checkpoints and completion/interruption/failure boundaries, not one event per token. Batching is not permission to truncate retained content.
- Load history incrementally and collapse or progressively render tool details to control client work. Do not solve rendering cost by deleting retained content.

Failure to persist required conversation content must be surfaced, not presented as successful durable history. Stop further execution on persistence failure as far as cancellation permits; already executed tools cannot be undone, and ambiguous side effects must never be automatically replayed. This is a Space Zero policy, not an assumed Pi storage-failure guarantee.

### Conversation actions

Expose only capabilities backed by Host commands:

- Send immediately shows a transient pending user message. Host confirmation reconciles it without duplication. A failed submission preserves the text and surfaces an error; an ambiguous outcome is not silently resubmitted.
- Sending while a turn runs enqueues a Host-owned follow-up. Both Session kinds support enqueue, queue visibility, and cancellation through shared conversation machinery; Global Chat requires extending its current API.
- Stop interrupts only the current turn. It does not pause or cancel queued follow-ups, which remain eligible to run. Cancelling a queued follow-up is a separate action.
- assistant-ui must not introduce an independent execution queue or impose its local queue's cancellation/draining behavior on the Host.
- Message editing and response regeneration remain unavailable initially. They require explicit Host semantics, particularly for repeated tool side effects.
- Approval metadata may be displayed, but an actionable approval control requires a supported Host approval command. Rich-content display does not implicitly authorize attachment submission, branching, steering, or other unsupported actions.

## Rationale

ExternalStoreRuntime lets Space Zero reuse assistant-ui conversation interaction while retaining its existing execution, authorization, and recovery architecture. Keeping the mapping in Desktop protects the browser-safe Client Runtime from React and library-specific dependencies without adding a speculative package.

A shared conversation core avoids implementing rich content and synchronization twice. Separate Session lifecycle and policy retain the meaningful distinction between a managed Project worktree and an app-level conversation.

Preserving structured Pi-returned content fixes the real information loss before it reaches the UI. Retaining Pi's existing tool limits avoids expanding this work into unlimited command-output capture, artifact retention, or temporary-file lifecycle management.

## Consequences

- This is an end-to-end conversation/runtime implementation, not only a Storybook or renderer slice: Pi Adapter, Host contracts, journal/projections, Client Runtime, and Desktop mapping require coordinated changes.
- Existing text-only histories remain readable, but missing reasoning and tool payloads cannot be fabricated for old records. Event/schema migration and compatibility behavior must be specified before implementation.
- assistant-ui versions and external queue behavior must be checked against a pinned release; upstream examples are not a stable contract by themselves.
- Content filtering, serializability, identities, ordering, history pagination, checkpoint reconciliation, and pending-command correlation require concrete contracts and boundary tests.
- Existing Space Zero text truncation must be removed or replaced by lossless batching where it conflicts with this decision. Measure SQLite transaction cost, event growth, and client rendering rather than assuming complete returned content is always small.
- Headless Host tests must cover structured history reload/replay, stream/checkpoint reconciliation, queue parity, interruption, and persistence failures. Adapter/UI tests must verify mapped content and capability gating without requiring provider execution.
- No separate large-payload artifact service, new generic event framework, broad Session-domain merger, or new shared React adapter package is required initially.

## Alternatives Considered

- **Plain-props-only chat UI with custom interaction logic** — rejected because it duplicates useful assistant-ui runtime behavior.
- **AI SDK-style chat transport or direct Pi runtime in Desktop** — rejected because Space Zero already has a Host-owned domain protocol and execution boundary.
- **Put assistant-ui mapping inside Client Runtime** — rejected to keep Client Runtime React- and assistant-ui-independent.
- **Implement two independent chat stacks** — rejected because conversation behavior should be shared while Session policies remain distinct.
- **Merge both complete Session domains** — rejected because Project resources and Global Chat lifecycle/authorization remain meaningfully different.
- **Keep Host history text-only** — rejected because the UI cannot recover omitted reasoning, tool details, or structured message boundaries.
- **Durably archive every underlying tool output and temporary file** — deferred because it adds storage and lifecycle complexity beyond preserving the conversation Pi returns.
- **Persist every token or silently truncate large content** — rejected in favor of batched durable content and complete retained results within Pi's existing tool semantics.

## Review Trigger

Revisit if:

- another client needs the React/assistant-ui adapter;
- measured SQLite or renderer performance cannot support retained Pi-returned content with batching and incremental loading;
- users need durable access to complete underlying tool output beyond Pi-returned results;
- assistant-ui cannot faithfully represent Host conversation or queue semantics without competing state ownership;
- privacy requirements cannot be met by the public structured-content boundary; or
- Session kinds converge enough that their remaining domain separation creates more complexity than it preserves.
