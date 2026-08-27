# Space Zero Pi SDK/Core Host Runtime Gap Analysis

**Status:** Architecture handoff / implementation planning input

**Scope:** Workspace Host integration with installed `@earendil-works/pi-agent-core` and `@earendil-works/pi-ai` `0.84.2`
**Suggested repository path if accepted:** `docs/architecture/pi-sdk-core-host-runtime-gap-analysis.md`

## Executive summary

Space Zero already has a secure narrow Project Session loop: authenticated prompt admission, one managed worktree and Pi conversation identity per Session, basic assistant/tool streaming, durable Space Zero events and messages, interruption, crash reconciliation, provider authentication, and bounded `read`/`write`/`edit` tools.

The current Pi integration is nevertheless turn-local and lossy. Each turn creates a fresh Pi `Agent`, reconstructs text-only history, fixes thinking to `off`, uses a runner-wide model, translates only coarse events, and discards Pi runtime state. That is not sufficient for production-long Sessions, faithful recovery, context compaction, durable steer/follow-up semantics, or rich Workspace Tools.

The recommended direction is not to rebuild Pi or adopt Pi CLI/TUI behavior. Space Zero should deepen its Host-owned Project Session runtime while keeping Pi Core behind `packages/pi-adapter`:

1. Correct terminal error handling and separate private journal facts from client-safe events.
2. Add durable per-Session model selection and effective per-turn configuration.
3. Persist adapter-private full-fidelity Pi session state and reconcile it with Space Zero events.
4. Add bounded reconnect-safe streaming checkpoints.
5. Use Pi Core compaction primitives under Host-owned policy.
6. Add typed retry/recovery behavior without replaying ambiguous side effects.
7. Add thinking and durable guide/follow-up queues as stronger desktop UX.
8. Register Host-owned Workspace Tools into Pi as custom tools.
9. Add curated, trusted resources only after a resource-policy decision.

A separate high-severity issue was found during this analysis: public Host Contract event variants currently contain canonical worktree/Git paths and filesystem identity values. Internal recovery events and client-visible events must be split or sanitized before richer runtime data is added.

---

## 1. Scope and non-goals

### Scope

This plan answers:

> What Pi SDK/Core capabilities should the Workspace Host surface, preserve, or delegate to make Space Zero Project Sessions production-ready?

Pi remains an implementation dependency behind Pi Adapter. Workspace Host owns product policy, durable Project Session state, command admission, recovery, Workspace Tools, and the stable Host Protocol. Space Zero messages and Session events remain the product source of truth; private Pi state exists only to run and recover the harness faithfully.

### Non-goals

This work does **not** include:

- Pi TUI parity;
- Pi CLI flag parity;
- Pi package-manager or extension-manager parity;
- Pi keybindings or themes;
- exact Pi JSON/RPC compatibility;
- exposing Pi session JSONL as a Space Zero contract;
- adopting Pi Coding Agent solely for `DefaultResourceLoader` or `createAgentSession()`;
- renderer access to Pi, SQLite, filesystems, processes, Git internals, or credential stores;
- broad implicit discovery of `~/.pi`, project extensions, or executable resources;
- automatic replay of model turns or external side effects whose outcome is ambiguous.

### Fixed package/runtime boundary

```text
Desktop renderer
  -> Client Runtime
  -> Host Contracts over authenticated HTTP/SSE
  -> Workspace Host application services
  -> Pi Adapter
  -> Pi SDK/Core
```

Raw Pi types, provider payloads, transcript formats, and provider credentials stop at Pi Adapter.

---

## 2. Current runtime baseline

### Implemented

- Host-owned Project catalog and managed-worktree Project Sessions.
- One durable conversation identity per Project Session.
- Prompt admission acknowledged separately from completion.
- Durable user/assistant messages and turn lifecycle events.
- Ephemeral assistant text deltas and coarse tool updates over SSE.
- Durable tool start/completion boundaries.
- Active-turn interruption through `AbortController`.
- Command receipt idempotency and per-Session serialization.
- Restart reconciliation to `recovery_required` without ambiguous replay.
- Host-private Pi provider credentials, API-key flows, and OAuth flows.
- Worktree-rooted `read`, `write`, and `edit` Pi tools with traversal and symlink defenses.

### Important limitations

- Provider/model are fixed at Pi runner construction.
- Thinking is hard-coded to `off`.
- Each turn creates and discards a fresh Pi `Agent`.
- History is reconstructed as `{ role, text }`, losing tool calls/results, usage, model changes, reasoning, compaction entries, and operation state.
- Assistant deltas are derived by diffing accumulated message text instead of mapping Pi's typed assistant events.
- Failures are reduced to coarse exception categories; Pi terminal stream errors may not be interpreted faithfully.
- Every assistant delta currently updates the durable draft rather than using bounded checkpoints.
- Concurrent prompt serialization is not steer/follow-up queueing.
- Complete history is sent on every turn with no context budget or compaction.
- No Workspace Tool Registry, approvals, resource policy, or private Pi session repository exists.

---

## 3. Capability analysis

## 3.1 Dynamic provider/model selection

**Priority:** **P0 for usable Project Session runtime**. Runtime switching after creation is P1 polish.

### Current state

Provider authentication and model lookup exist in Pi Adapter, but `PiConversationConfig` fixes provider/model when the runner is constructed. Session contracts, projections, migrations, Client Runtime, and renderer have no selected-model state.

### Why Space Zero needs it

A production Session needs a deterministic authenticated model choice, visible configuration errors, and reproducible recovery. A process-wide fixed model cannot support Sessions using different providers/models or restore the configuration used by an admitted turn.

### Ownership

- **Workspace Host:** Host default preference, Session selection policy, admission, persistence, and availability state.
- **Pi Adapter:** non-secret model catalog, auth/capability checks, ID-to-Pi-model resolution.
- **Host Contracts:** sanitized catalog descriptors, selected Session configuration, stable errors.
- **Client Runtime:** catalog/configuration queries and idempotent mutation commands.
- **Renderer:** picker and configuration-required UI.

### Recommended protocol

```ts
type ModelDescriptor = {
  providerId: string;
  modelId: string;
  displayName: string;
  authenticated: boolean;
  available: boolean;
  reasoningSupported: boolean;
  supportedThinkingLevels: ThinkingLevel[];
  contextWindow?: number;
};

type SessionAgentConfiguration = {
  providerId: string;
  modelId: string;
  defaultThinkingLevel: ThinkingLevel;
  revision: number;
};
```

Suggested operations:

- `GET /agent-runtime/models`
- `GET /project-sessions/:sessionId/runtime`
- `PATCH /project-sessions/:sessionId/runtime` with `commandId` and expected configuration revision

Changing the model should initially require an idle Session. Each admitted turn snapshots the effective provider/model.

### Persistence

- Conventional Host-global default preference, used only to seed new Sessions.
- Event-sourced Session selection, for example `SessionModelSelectionChangedV1`.
- Effective provider/model IDs on every turn admission.
- Do not persist model objects, complete volatile catalogs, credentials, or provider configuration payloads.

### Pi Adapter changes

- Expose a Space Zero-owned catalog/result seam over `Models.getProviders`, `getModels`, `getAvailable`, `getModel`, and `checkAuth`.
- Resolve the selected model immediately before execution.
- Remove provider/model from process-wide runner identity.
- Return stable adapter failures for missing, stale, unavailable, and unauthenticated choices.

### UI/client implications

- Model picker with non-secret authentication/availability status.
- Existing Sessions do not change when the global default changes.
- No silent fallback if the selected model becomes unavailable.

### Security

Catalog responses must not include keys, OAuth details, auth file paths, provider headers, or raw provider model records.

### Testing

- Two Sessions use different models through a deterministic adapter fake.
- Default is snapshotted at Session creation.
- Idle change succeeds; active-turn change fails predictably.
- Selection survives restart and command replay.
- Missing auth/unavailable model fails without fallback or secret leakage.
- Narrow no-paid-call compatibility test verifies installed Pi model APIs.

### Issue candidates

1. Add sanitized model catalog adapter and Host query.
2. Persist per-Session model selection and per-turn effective model.
3. Add model selection UI and configuration-required states.

### Open decisions

- Where the Host-global default is configured in the product UI.
- Whether model change should later be allowed while a queued instruction exists.

---

## 3.2 Thinking level selection

**Priority:** **P1 for strong desktop harness UX**.

### Current state

Pi Adapter hard-codes `thinkingLevel: "off"`. Installed Pi Core supports `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`, but support varies by model.

### Why Space Zero needs it

Thinking materially affects quality, latency, and cost, but `off` remains a usable default. It is therefore not a blocker for the first dependable runtime.

### Ownership

- **Workspace Host:** Session default, optional prompt override, effective-value persistence.
- **Pi Adapter:** model-capability validation and Pi mapping.
- **Host Contracts:** Space Zero-owned enum and unsupported-setting error.
- **Client Runtime/renderer:** supported choices and controls.

### Recommended protocol

- Session runtime configuration includes `defaultThinkingLevel`.
- `SubmitPromptRequest` may later include `thinkingLevelOverride`.
- Turn projection includes requested and effective values.

Do not import Pi's TypeScript enum into Host Contracts even if values match.

### Persistence

- Host-global preference may seed new Sessions.
- Persist Session default.
- Persist the effective level on every admitted turn.
- Add per-prompt override only after Session-level behavior ships.

### Pi Adapter changes

Resolve supported levels for the selected model and set the effective level before execution. Reject unsupported choices with a stable error and supported-level list. Do not silently clamp unless that behavior is explicitly adopted as product policy.

### UI/client implications

- Show only supported choices for the selected model.
- Revalidate the Session default after model changes.
- Do not conflate thinking with tool permissions or safety.

### Security

Thinking configuration is safe to expose; raw hidden reasoning is not. Reasoning visibility requires a separate bounded display/retention policy.

### Testing

All enum values, unsupported combinations, model changes, prompt overrides, idempotent admission, persistence, and effective-value projection.

### Issue candidates

1. Add model-aware Session thinking default.
2. Add optional per-prompt override.
3. Decide and implement safe reasoning display separately.

### Open decisions

- Whether reasoning content is ever shown or persisted. Recommended default: do not persist hidden reasoning; expose only explicitly provider-displayable reasoning through a separate bounded contract.

---

## 3.3 Full-enough model/tool/assistant streaming

**Priority:** **P0 foundation**, with rich reasoning/usage/tool presentation as P1.

### Current state

Assistant text deltas, durable final assistant messages, durable tool boundaries, and live tool summaries exist. Missing or weak behavior includes typed assistant block mapping, terminal stream error interpretation, usage/finish metadata, reconnectable active drafts, structured safe tool state, and bounded checkpoint writes.

Current durable draft updates happen on each assistant delta, contrary to the bounded checkpoint model in ADR 0028.

### Why Space Zero needs it

The client must render responsive output without losing authoritative active state after reconnect. A terminal provider error must never be journaled as successful completion. The Host must avoid one SQLite write per token/provider fragment.

### Ownership

- **Pi Adapter:** ordered translation of Pi assistant/tool events into Space Zero adapter events.
- **Workspace Host:** batching, durable checkpoints, final lifecycle facts, redaction, limits.
- **Host Contracts:** stable content/checkpoint/tool DTOs and sanitized finish/failure metadata.
- **Client Runtime:** projection-plus-cursor reload and ephemeral delta application.
- **Renderer:** partial assistant content, coarse tool cards, reconnect and terminal states.

### Recommended protocol

Maintain two channels:

- **Durable:** content checkpoints, tool start/completion, turn completion/failure/interruption.
- **Ephemeral:** text/content deltas and bounded tool progress.

Add an authoritative active-turn projection query containing:

- completed messages;
- current assistant draft/content blocks;
- current safe tool activity;
- effective model/thinking configuration;
- terminal or active turn state; and
- durable cursor included by the projection.

A reconnecting client reloads the projection, then subscribes after its cursor.

### Persistence

- Batch content checkpoints by time/size and flush at tool/lifecycle boundaries.
- Never persist each provider token as an event.
- Persist full final content on completion, interruption, and failure.
- Persist only bounded, redacted tool fields.

### Pi Adapter changes

- Translate `message_update.assistantMessageEvent` directly instead of diffing `agent.state.messages`.
- Preserve event order and correlate interleaved blocks by content index internally.
- Interpret terminal `error` and `aborted` outcomes explicitly.
- Surface safe usage/finish metadata only after provider compatibility is proven.

### UI/client implications

- Active partial responses survive reconnect through projection reload.
- Tool cards use stable Space Zero states, not Pi payloads.
- Partial output can remain visible on failure/interruption.

### Security

Never stream raw provider events, provider error messages, hidden reasoning, unrestricted tool arguments/results, absolute paths, or stack traces.

### Testing

- Interleaved text/tool event ordering.
- Partial content followed by error or abort.
- Awaited final flush before completion.
- Disconnect/reconnect during text and tool execution.
- No duplicates/gaps after projection reload plus SSE catch-up.
- Bounded checkpoint/event frequency and live-buffer backpressure.
- Contract tests prove forbidden paths/secrets/Pi shapes are absent.

### Issue candidates

1. Fix typed Pi terminal outcomes and direct assistant event mapping.
2. Add batched durable draft checkpoints.
3. Add reconnectable active-turn projection.
4. Add P1 usage/reasoning/rich tool presentation under explicit privacy limits.

### Open decisions

- Which provider usage values are stable enough for the public product contract.
- Whether any reasoning block is user-visible and how it is retained.

---

## 3.4 Prompt queueing: steer and follow-up

**Priority:** **P1 for strong desktop harness UX**. P0 behavior should reject or disable additional prompts while active rather than pretending serialization is queueing.

### Current state

Per-Session locking serializes submissions, and `queued` exists as a turn state, but there is no queue identity, delivery mode, cancellation, projection, or recovery semantics. A fresh Pi `Agent` per turn cannot steer an active run safely.

Installed Pi Core distinguishes:

- steering: delivered after the current assistant/tool boundary;
- follow-up: delivered after the current run would otherwise become idle.

Steering is not immediate interruption.

### Why Space Zero needs it

It enables active supervision without forcing an interrupt and improves long-running desktop workflows. The narrow runtime remains usable without it if additional sends are explicitly rejected.

### Ownership

- **Workspace Host:** durable queue authority, ordering, dispatch, cancellation, and crash reconciliation.
- **Pi Adapter:** delivery to the retained active Pi runtime.
- **Host Contracts:** Space Zero-native commands and queue projections.
- **Client Runtime/renderer:** queue controls and clear semantics.

### Recommended protocol

Use product language rather than Pi method names, for example:

```ts
type InstructionDelivery = "next_agent_boundary" | "after_agent_idle";
```

Suggested operations:

- `POST /project-sessions/:sessionId/instructions`
- `DELETE /project-sessions/:sessionId/instructions/:instructionId`

UI labels could be **Guide after current step** and **Queue follow-up**. Interrupt remains a separate command.

### Persistence

Persist before acknowledgment:

- stable instruction ID and command ID;
- delivery mode and FIFO order;
- state: `queued`, `dispatched`, `consumed`, `cancelled`, or `recovery_required`;
- owning Session/run/turn and message identity.

Queued-but-proven-undispatched work can be restored. Dispatched-but-unconsumed work is ambiguous and must not be automatically replayed.

### Pi Adapter changes

Retain a scoped active Agent/runtime handle or deliberately adopt a subordinate Pi harness/session mechanism. Map Host delivery modes to `steer` and `followUp`. Do not make Pi's in-memory queues the durable authority.

### UI/client implications

Show queued items, delivery semantics, cancellation, and recovery state. Do not call steering “interrupt” or imply it stops an active tool.

### Security

Queue commands require Session-scoped authorization, bounded prompt size, idempotent command IDs, and the same input treatment as normal prompts.

### Testing

FIFO, one-at-a-time semantics, steer versus follow-up ordering, active tools, cancellation, duplicate commands, interruption, restart before/after dispatch, and ambiguous delivery recovery.

### Issue candidates

1. Reject active-turn submissions explicitly as a P0 cleanup.
2. Add durable Space Zero instruction queue.
3. Connect retained active runtime to steer/follow-up.
4. Add queue UI and mock-Host scenarios.

### Open decisions

- Final product terminology.
- Whether queued instructions are editable or only cancellable; cancellation-only is recommended initially.

---

## 3.5 Long-session context management and compaction

**Priority:** **P0 for usable Project Session runtime**.

### Current state

Every turn reloads complete text-only user/assistant history. There is no token accounting, context budget, compaction lifecycle, retained tail, or summary persistence.

Pi Core provides compaction primitives, but constructing `Agent` does not activate compaction automatically.

### Why Space Zero needs it

Without compaction, sufficiently long Sessions will exceed model context or become unbounded in cost and latency. Text-only history also omits context required for faithful tool-aware continuation.

### Ownership

- **Workspace Host:** trigger policy, serialization with turns/queues, durable lifecycle, user-visible status.
- **Pi Adapter:** token estimation, cut-point preparation, summary generation, compacted private Pi context.
- **Host Contracts:** safe context status and compaction lifecycle metadata.
- **Client Runtime/renderer:** quiet status and optional later manual action.

### Recommended approach

Use Pi Core compaction directly behind Pi Adapter. Do not build an independent Host summarizer initially.

“Both” applies only to responsibility:

- Host decides **when and whether** compaction occurs.
- Pi Adapter decides **how** Pi context is compacted using installed Core primitives.

Space Zero's user-visible message history remains complete. The compacted summary and retained tail are private Pi context.

### Protocol

Expose safe context state such as:

- `healthy`, `near_limit`, `compacting`, or `blocked`;
- approximate used/available context where reliable;
- compaction completed/failed activity marker.

Do not expose the raw compaction summary by default.

### Persistence

- Store detailed compaction entries in adapter-private Pi state.
- Store Space Zero lifecycle facts and safe counts/checkpoint identity in the Session journal.
- Never replace prior Pi context until the compacted state is durably committed.
- Do not replay complete Space Zero history after compaction.

### Pi Adapter changes

Use `shouldCompact`, `prepareCompaction`, and `compact` with model context size, reserve budget, and retained-tail policy. Return typed outcomes and retain the old state on failure.

### UI/client implications

Show unobtrusive context status and a “Context compacted” event. Manual compact-now can be P1.

### Security

Compaction summaries can contain source, prompts, tool results, and secrets. Keep them adapter-private and out of ordinary logs, telemetry, SSE, and diagnostics.

### Testing

Small deterministic context windows; threshold behavior; retained-tail ordering; tool/message fidelity; restart after compaction; duplicate prevention; failure/abort preserving old state; context overflow leading to at most one safe compact-and-retry.

### Issue candidates

1. Introduce faithful private Pi context state.
2. Add Host context budget and compaction policy.
3. Add Pi Core compaction execution and recovery tests.
4. Add optional manual compaction UX.

### Open decisions

- Initial reserve and retained-tail defaults, which should be operational configuration informed by tests and measurements.

---

## 3.6 Retry and error lifecycle

**Priority:** **P0 for usable Project Session runtime**.

### Current state

Space Zero has durable failed/interrupted/recovery-required states, command idempotency, and safe no-replay recovery. Pi Adapter currently collapses most failures to `agent_turn_failed` and may miss failures represented as terminal stream values.

### Why Space Zero needs it

Builders need to distinguish authentication/configuration failures from rate limits, context limits, transient provider faults, tool failures, interruption, and unknown crash outcomes. Retry must never duplicate ambiguous external effects.

### Ownership

- **Pi Adapter:** classify Pi/provider terminal outcomes into sanitized adapter failures.
- **Workspace Host:** retry eligibility, attempts, backoff, recovery actions, and no-replay policy.
- **Host Contracts:** stable public failure categories and commands.
- **Client Runtime/renderer:** actionable states without raw provider errors.

### Recommended lifecycle

Model a logical turn with numbered execution attempts. Suggested safe public categories:

- `authentication_required`
- `configuration_invalid`
- `rate_limited`
- `provider_unavailable`
- `network_failure`
- `context_limit`
- `tool_failed`
- `interrupted`
- `internal_failure`
- `recovery_required`

Each outcome may carry bounded `retryable` and trusted `retryAfterMs` metadata.

Automatic retry is permitted only for a classified live provider request where no ambiguous tool/external side effect has begun. A crash with uncertain execution remains `recovery_required`.

Suggested commands:

- retry as a new operation referencing the failed turn;
- continue with a new instruction;
- abandon the recovery-required operation.

Do not rewrite or blindly replay the old turn.

### Persistence

Durable attempt started/completed/failed/interrupted/retry-scheduled facts, sanitized category, eligibility, and whether an external side-effect boundary was crossed.

### Pi Adapter changes

- Interpret terminal `error`/`aborted` states, partial content, and bounded retry metadata.
- Redact provider messages.
- Add faux-provider compatibility tests before promising provider-specific categories.

### UI/client implications

Actionable error text, attempt count, trusted retry countdown, and distinct Retry/Continue/Abandon actions.

### Security

Never expose raw provider exceptions, request/response bodies, headers, stack traces, account identifiers, or secrets.

### Testing

Controlled clocks; backoff cap; auth failure; rate limit; context overflow; partial output; tool failure; interrupt; crash at each attempt boundary; command replay; and proof that ambiguous work is not retried automatically.

### Issue candidates

1. Correct Pi terminal error translation.
2. Add stable failure categories and attempt projection.
3. Add bounded safe live retry.
4. Add explicit recovery-resolution commands and UI.

### Open decisions

- Exact automatic retry count and cap should remain operational policy, not a durable wire guarantee.

---

## 3.7 Rich Workspace Tools integration

**Priority:** **P1 overall**; the registry and safety foundation is P0 before adding any privileged process, Git, or application tool.

### Current state

Pi Adapter exposes only worktree-bounded `read`, `write`, and `edit`. The Host hard-codes those names. There is no Workspace Tool Registry, safety classification, confirmation policy, approval lifecycle, structured product results, or activity projection.

### Why Space Zero needs it

Workspace Tools are how agents should operate Space Zero application behavior through the same Host services used by human protocol handlers. Rich tools are a product differentiator, but the current bounded file slice is enough for an initial narrow coding loop.

### Ownership

- **Workspace Host:** tool definitions, Effect Schema validation, scope, safety, authorization, confirmation, activity, and application-service handlers.
- **Pi Adapter:** convert approved Host descriptors/invokers into Pi custom `AgentTool`s and translate lifecycle events.
- **Host Contracts:** approvals and bounded/redacted activity DTOs.
- **Client Runtime/renderer:** approval and activity UI only.

### Recommended design

```text
Pi conversation
  -> Pi Adapter custom-tool wrapper
  -> Workspace Tool Registry / safety policy
  -> owning Workspace Host application service
  -> authorized adapter
```

Workspace Tools should be **registered into Pi as custom tools**. They should neither expose opaque Pi defaults as the control plane nor replace Host application services.

Each registry entry should declare:

- stable dotted name;
- input/result schemas;
- Session/Project scope;
- safety: `read`, `write`, or `dangerous`;
- side-effect and idempotency metadata;
- cancellation behavior;
- handler that calls an owning Host service.

Migrate `read`/`write`/`edit` behind the registry while preserving authenticated worktree roots, traversal/symlink denial, allowlists, and sequential execution.

### Protocol

Add only bounded product events and approval commands:

- approval requested/resolved;
- tool started/progress/completed/failed/unknown;
- safe relative target and summary;
- structured safe result fields selected per tool.

### Persistence

Durable coarse activity and approval state belong in the Session journal. Raw arguments, output, subprocess streams, and adapter details do not.

### UI/client implications

Tool cards, safety label, relative target, approval controls, status, and recovery state. Render all model/tool content as untrusted.

### Security

- Renderer cannot define or execute tools.
- Host revalidates all arguments even if Pi validated them.
- Authorization is enforced in Host services.
- Dangerous tools require accepted policy/approval behavior.
- Raw absolute paths, secrets, process environments, and unrestricted output never cross the protocol.

### Testing

Duplicate/unknown definitions; schema failures; wrong Session/Project/worktree; path traversal and symlink escape; allow/deny/expired approval; cancellation; secret redaction; crash before/after side effect; and no fallback to base checkout or direct SQLite access.

### Issue candidates

1. Add Workspace Tool Registry and migrate file tools.
2. Add global safety policy and durable approvals.
3. Add rich bounded activity projection/UI.
4. Add concrete Git/process/application tools one vertical slice at a time.

### Open decisions

- Global confirmation defaults and dangerous-tool bypass policy require a security/architecture decision before broad tools ship.

---

## 3.8 Context files, skills, and prompt templates

**Priority:** **P2 advanced/defer**. Curated skills may be promoted to P1 if selected as a product milestone.

### Current state

No runtime resource loader, trust policy, resource contract, or UI exists. Product context says skills may be global or project-local and Pi should expand `/skill:name`. Installed Pi Core has skill and prompt-template primitives but does **not** provide the Coding Agent `DefaultResourceLoader`.

### Why Space Zero may need it

Skills can provide reusable workflows and product differentiation. Generic context files and prompt templates are optional and can create prompt-size, precedence, privacy, and project-trust problems if enabled broadly.

### Ownership

- **Workspace Host:** discovery roots, trust, precedence, activation, limits, diagnostics, manifests, and change policy.
- **Pi Adapter:** Pi-specific formatting and invocation expansion using installed Core primitives.
- **Host Contracts:** logical descriptors, scope, enabled state, digest/version, safe diagnostics.
- **Client Runtime/renderer:** discovery, trust, and selection UI.

### Recommended policy

Use a **curated Host policy**, not `DefaultResourceLoader` and not broad Pi discovery.

- No implicit extension or executable resource discovery.
- Project-local resources are inert until the Project is trusted.
- Bound resource count, file size, total prompt budget, recursion, and diagnostics.
- Define deterministic precedence and collision behavior.
- Persist logical IDs, scope, content digest, and activation—not raw absolute paths or content.
- Snapshot the effective resource manifest per admitted turn.
- Actual content remains in the trusted worktree/private adapter context.

Skills should ship before generic prompt templates/context files. Prompt templates should be explicit opt-in. Context files should use Space Zero bounded reads and an explicit precedence policy.

### Protocol

Possible safe descriptors:

```ts
type AgentResourceDescriptor = {
  resourceId: string;
  kind: "skill" | "prompt_template" | "context_file";
  name: string;
  scope: "host" | "project";
  digest: string;
  trusted: boolean;
  enabled: boolean;
};
```

Do not return absolute paths or inactive resource contents.

### Persistence

- Persist Project trust in Host-owned Project state.
- Persist selection/activation and per-turn effective manifest.
- Do not copy complete resource contents into Session events.

### Pi Adapter changes

Accept explicit approved resources. Use Core skill/template parsing and formatting where useful. Inject context through an explicit adapter system/context seam. Do not claim Coding Agent loader compatibility.

### UI/client implications

Safe resource picker, scope/provenance display, trust prompts, and diagnostics without private paths.

### Security

Project resources are untrusted instructions, not authorization. Guard against symlink escape, resource bombs, malicious prompts, collisions, secret leakage, and executable extensions.

### Testing

Trust grant/revocation; precedence and collisions; malformed files; size/count/token bounds; symlink escape; content changes; stale digests; restart determinism; and no path/content leakage.

### Issue candidates

1. Decide resource trust/discovery/precedence policy in an ADR.
2. Add curated skill discovery and explicit invocation.
3. Add opt-in templates if product need is proven.
4. Add bounded context files only after precedence semantics are accepted.

### Open decisions

- Exact roots and precedence among Space Zero Home, `~/.agents/skills`, project `.agents/skills`, and project `.pi/skills`.
- Trust UX and behavior when an activated resource changes mid-Session.
- Whether prompt templates/context files warrant product support at all.

---

## 3.9 Pi transcript/session strategy

**Priority:** **P0 decision and recovery substrate**; diagnostic/export UX is P2.

### Current state

SQLite stores a conversation ID, while each turn reconstructs text-only history. Pi transcript/session storage is not used. ADR 0028 says Pi state remains adapter-private and Space Zero events remain authoritative.

### Why Space Zero needs private full-fidelity state

Faithful continuation, tool/message ordering, model and thinking changes, usage-aware compaction, queues, and recovery cannot be reconstructed from `{ role, text }` alone. The current path should remain a temporary compatibility mechanism.

### Recommendation

Persist one full-fidelity Pi Core session per active/resumable Project Session in **adapter-private storage under Workspace Host application data**, keyed indirectly by the durable conversation identity.

The required outcome is full-fidelity adapter-private state; the mechanism is not yet selected. Installed Pi Core JSONL/session storage is one candidate and an adapter-owned faithful projection is another. A focused compatibility spike is a decision gate: it must compare a retained low-level `Agent` with a subordinate Pi harness/session mechanism, define mapping from Space Zero turn/operation IDs, and verify atomic flush, permissions, corruption, versioning, and recovery behavior before an implementation issue is opened. Adopting Pi `AgentHarness` is not a drop-in change and must not transfer queue, lane, operation, or persistence authority away from Workspace Host.

### Authority split

- **Space Zero Session Event Journal:** authoritative for product history, commands, messages, approvals, lifecycle, client cursors, and recovery decisions.
- **Private Pi session state:** authoritative only for harness continuation, full tool/message fidelity, model/thinking/usage context, compaction, and Pi operation reconciliation.

The stores cannot be updated atomically. Correlate them with Space Zero turn/operation IDs and reconcile after restart. Missing, corrupt, ahead, behind, or open Pi operations fail to `recovery_required`; they must not silently fall back to text reconstruction and resume.

### Ownership

- **Pi Adapter:** storage format, open/run/interrupt/reconcile/seal/delete behavior, permissions, integrity.
- **Workspace Host:** conversation identity, lifecycle orchestration, retention command, reconciliation decision.
- **Host Contracts/client/renderer:** only sanitized recovery status; never transcript content or location.

### Persistence and retention

- Store Pi files outside Host SQLite, worktrees, Git, and Space Zero Home.
- Store only opaque identity/version/last-settled-operation/reconciliation metadata in Host projections.
- Retain while Session is active, resumable, or recovery-required.
- Purge on successful archive because archive is history-only.
- Purge on permanent deletion.
- Any retention after archive requires an explicit bounded diagnostic policy.
- Diagnostic export is explicit, local, warned, redacted, and not an ordinary Host Protocol response.

### Security

Pi state can contain prompts, source, tool results, provider metadata, and accidental secrets even if credentials are excluded. Apply restrictive permissions, redacted logging, no default telemetry/export, cleanup tests, and corruption quarantine.

### Testing

Rich restore without fabricated text-only messages; crash reconciliation; open/completed operation comparison; missing/corrupt/version-mismatched store; archive/delete cleanup; restrictive placement/permissions; and proof that raw Pi data never enters SQLite events, SSE, renderer state, logs, or automatic support bundles.

### Issue candidates

1. Compatibility spike for Pi Core Session/JSONL APIs.
2. Implement adapter-private session repository and reconciliation seam.
3. Integrate retention with archive/delete.
4. Add opt-in local diagnostics later.

### Open decisions

- Immediate purge on archive is recommended; any alternative retention duration needs product/security approval.
- Whether to use Pi's JSONL backend directly or a Pi Adapter-owned faithful projection after the compatibility spike.

---

## 4. Prioritization summary

| Area                             | Priority                          | Rationale                                                                                                                       |
| -------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Dynamic provider/model selection | **P0**                            | A Session needs a deterministic authenticated model and effective configuration.                                                |
| Thinking level selection         | **P1**                            | Improves quality/cost control; `off` remains usable.                                                                            |
| Full-enough streaming            | **P0 foundation / P1 enrichment** | Correct terminal outcomes, bounded checkpoints, and reconnect are correctness requirements; rich reasoning/usage UI can follow. |
| Steer/follow-up queueing         | **P1**                            | Strong supervision UX; initial runtime can reject sends while active.                                                           |
| Context management/compaction    | **P0**                            | Long Sessions otherwise fail or become unbounded.                                                                               |
| Retry/error lifecycle            | **P0**                            | Required for safe, actionable failures and no-replay recovery.                                                                  |
| Rich Workspace Tools             | **P1**                            | Narrow bounded file tools are usable; registry/safety is mandatory before privileged tools.                                     |
| Context files/skills/templates   | **P2**                            | Optional and security/policy heavy; curated skills may be promoted.                                                             |
| Pi transcript/session strategy   | **P0 substrate / P2 diagnostics** | Faithful recovery and compaction need private full-fidelity state; export is optional.                                          |

### Minimum P0 release bar

A usable production Project Session runtime should have:

1. client-safe event contracts;
2. correct Pi terminal error interpretation;
3. per-Session model selection and per-turn snapshot;
4. adapter-private faithful Pi state and fail-closed reconciliation;
5. bounded reconnectable assistant/tool checkpoints;
6. context budget and compaction;
7. typed attempts, safe retry, and explicit recovery actions; and
8. explicit rejection of additional prompts while active until P1 queueing ships.

---

## 5. Explicit architecture answers

### Should model/provider selection be Session state or a Host-global preference?

**Both, with different authority.** A Host-global preference seeds new Sessions. The selected provider/model is durable Project Session state, and every admitted turn snapshots the effective selection. Global changes never silently alter existing Sessions.

### Should thinking level be per Session, per prompt, or global?

Use a Host-global seed, a **per-Session default**, and an optional **per-prompt override**. Persist the effective per-turn value. Ship Session default first.

### Should queueing mirror Pi names?

Mirror the two semantics, not Pi's API vocabulary. Use Space Zero-native values such as `next_agent_boundary` and `after_agent_idle`. Document that guiding does not interrupt an active tool; interruption remains separate.

### Should Space Zero use Pi compaction, Host summarization, or both?

Workspace Host owns policy and lifecycle; Pi Adapter uses Pi Core compaction primitives. Do not build a second summarizer initially. User-visible message history stays complete while compacted Pi context remains private.

### Should Workspace Tools wrap, replace, or register into Pi?

Register Host-owned Workspace Tools into Pi as custom tools. The Host registry owns schema, scope, safety, approval, and handlers. Pi Adapter only bridges them. Migrate existing bounded Pi file tools behind the registry rather than maintaining a parallel permanent tool system.

### Who should load context files, skills, and prompts?

Use a curated Workspace Host policy for discovery, trust, precedence, limits, and activation. Pi Adapter performs Pi-specific formatting/expansion using installed Core primitives. Do not use unavailable `DefaultResourceLoader` or broad Pi/Coding Agent discovery.

### Should raw Pi session data be persisted?

Yes, for active/resumable Sessions, in adapter-private storage under Host application data—not Host SQLite, worktrees, or Host Protocol. Retain while resumable/recovery-required; purge on archive and deletion by default. Space Zero events remain authoritative product history.

### What must never cross Host Protocol?

- Provider API keys, OAuth tokens/callback secrets, refresh credentials, auth files.
- Bootstrap secrets and Host-lifetime supervisor capabilities in any Host Protocol request or response.
- Short-lived client capabilities anywhere except the request authorization mechanism; they must never appear in URLs, JSON bodies, SSE events, logs, telemetry, durable events, or persistent renderer state.
- Raw Pi objects, events, errors, session entries, JSONL, transcript paths, or provider session IDs.
- Raw provider requests/responses/headers/payloads and unsanitized provider errors.
- Hidden chain-of-thought or unrestricted reasoning traces.
- Absolute repository/worktree/Git/app-data/resource/transcript paths.
- Filesystem device, inode/file identity, or handles.
- SQLite rows, migration state, Effect causes/fibers/layers.
- Raw tool arguments/results, process environments, secret-bearing command lines, or unrestricted subprocess output.
- Inactive resource contents and private discovery diagnostics.
- Electron, Node process/filesystem, or Pi tool schema types.

Use stable IDs, repository-relative paths, bounded summaries, safe usage totals, logical resource descriptors, and stable public errors instead.

---

## 6. Required architecture decisions and prerequisite correction

### A. Split internal durable facts from public events — high severity

`packages/host-contracts/src/project-sessions/project-session.schema.ts` currently includes worktree/Git paths and filesystem identity in event variants delivered through the public Session stream. Internal recovery facts need Workspace Host-private schemas. Public SSE and projections should receive sanitized product events.

This should be resolved before adding model, transcript, resource, or richer tool metadata. The fix must preserve projection rebuild and worktree authentication while removing Host-private fields from client payloads.

### B. Amend ADR 0028 and ADR 0029

Clarify:

- adapter-private Pi session persistence outside Host SQLite;
- authority split between Session Journal and Pi runtime state;
- cross-store operation IDs and reconciliation;
- behavior for missing/corrupt/mismatched Pi state;
- archive/delete retention;
- prohibition on exposing Pi formats.

### C. Add an agent runtime configuration/context ADR

Record:

- per-Session model selection and per-turn snapshot;
- thinking defaults/overrides;
- Host-owned compaction lifecycle;
- queue semantics and crash boundaries;
- relation between Pi-private state and Space Zero events.

### D. Add a resource-policy ADR before project-local loading

Define roots, trust, precedence, collisions, limits, activation snapshots, change behavior, and privacy-safe diagnostics.

### E. Decide dangerous Workspace Tool policy before broad tools

The narrow registry can follow the current Workspace Tool guide. Confirmation defaults, dangerous-tool bypass, approval recovery, and unknown side effects require explicit security acceptance.

### F. Do not add Pi Coding Agent implicitly

Installed authoritative APIs are Pi Core/AI `0.84.2`. `DefaultResourceLoader` and `createAgentSession()` belong to another package/API surface. Adding it requires a separate dependency and security review and is not recommended for this plan.

---

## 7. Dependency-ordered implementation slices

### Phase 0 — decisions and security foundation

1. **Split private Session journal schemas from public Session events.**
2. **Correct Pi terminal error/abort handling with deterministic faux-stream tests.**
3. **Accept ADR updates for private Pi state, runtime configuration, and recovery authority.**

### Phase 1 — P0 model and recovery substrate

4. **Add sanitized model catalog and per-Session selection.**
5. **Persist effective per-turn execution configuration.**
6. **Run a decision-gate spike for adapter-private full-fidelity state.** Compare retained low-level `Agent` versus subordinate harness/session coordination and Pi JSONL versus an adapter-owned faithful projection; define Space Zero operation mapping and failure behavior.
7. **After accepting the spike decision, implement adapter-private state, Pi/Space Zero reconciliation, and archive/delete retention as separate vertical issues.**

### Phase 2 — P0 streaming, longevity, and failure lifecycle

8. **Map typed assistant/tool events and batch durable checkpoints.**
9. **Add active-turn projection and reconnect/cursor behavior.**
10. **Add Host-owned context budget and Pi Core compaction.**
11. **Add attempt-aware failures, bounded safe retry, and recovery-resolution commands.**

### Phase 3 — P1 desktop harness UX

12. **Add model-aware Session thinking selection.**
13. **Add durable guide/follow-up queue and retained active runtime coordination.**
14. **Add Workspace Tool Registry and migrate bounded file tools.**
15. **Add approvals, coarse activity history, and rich safe tool UI.**
16. **Add richer usage/reasoning presentation only under accepted privacy policy.**

### Phase 4 — P2 curated resources and diagnostics

17. **Accept resource trust/discovery ADR.**
18. **Add curated skills and explicit invocation.**
19. **Add opt-in prompt templates/context files only if product need is proven.**
20. **Add transcript integrity cleanup and explicit redacted local diagnostics.**

Each slice should update Host Contracts, Pi Adapter, Workspace Host, Client Runtime, renderer, and mock-Host scenarios only where that vertical behavior requires them. Do not create speculative empty modules.

---

## 8. Cross-cutting testing strategy

### Host Contracts

- Additive versioned schemas and unknown-version handling.
- Stable sanitized errors.
- Strict absence of credentials, absolute paths, filesystem identity, raw Pi/provider shapes, and unrestricted payloads.
- OpenAPI and mock-Host conformance.

### Pi Adapter

- Fake `Models` and streams for model/thinking support.
- Interleaved assistant/tool blocks and ordered awaited listeners.
- Terminal `error`/`aborted`, partial output, cancellation, and cleanup.
- Durable private session restore, compaction, queue delivery, and reconciliation.
- Narrow no-paid-call compatibility suite for installed `0.84.2` APIs.

### Workspace Host

Use real HTTP/SSE, real `node:sqlite`, temporary Git repositories/worktrees, and deterministic Pi Adapter fakes:

- migrations and projection rebuild;
- command receipts and configuration revisions;
- bounded checkpoints and reconnect;
- context threshold/compaction;
- attempts/backoff with controlled time;
- queue crash boundaries;
- transcript corruption/mismatch and no ambiguous replay;
- archive/delete cleanup;
- authorization and redaction.

### Client Runtime

- Projection-plus-cursor catch-up.
- Delta deduplication and active draft restore.
- Command ID reuse/conflict behavior.
- Stable failure/configuration/queue projections.
- capability replacement after Host restart.

### Renderer and Electron

- Pure view/container tests for model, thinking, streaming, retries, queue, approvals, and resources.
- Broad mock-Host Electron scenarios over real HTTP/SSE.
- Narrow real-Host tests for private app-data permissions, restart/reconciliation, connection replacement, and shutdown.
- No paid provider calls in normal CI.

---

## 9. Main risks

- **Protocol exposure:** current public events contain Host-private filesystem facts.
- **Cross-store crash boundary:** SQLite and Pi-private storage cannot commit atomically; operation IDs and fail-closed reconciliation are mandatory.
- **Transcript sensitivity:** private Pi state can contain code, prompts, tool results, and accidental secrets.
- **Stateful runtime migration:** moving from fresh Agents/text history changes recovery and test assumptions.
- **Provider variance:** error categories, retry behavior, usage, reasoning, and context metadata differ by provider.
- **SQLite contention:** checkpoint and activity frequency must be measured and bounded.
- **Queue ambiguity:** dispatch across a Host crash cannot be inferred safely from missing completion.
- **Resource trust:** project instruction files are untrusted and must never confer OS/Host authorization.
- **Version drift:** installed Core `0.84.2`, not upstream `main` or Coding Agent SDK, is the implementation contract.

---

## 10. Recommended next action

Before opening implementation issues, accept the three architecture decisions that affect durable compatibility:

1. private versus public Session event separation;
2. adapter-private Pi session persistence and retention;
3. per-Session runtime configuration, compaction, retry, and queue authority.

Then create the Phase 0 and Phase 1 issues first. Workspace Tools and resource discovery should remain separate tracks so they do not block the P0 runtime correctness work.
