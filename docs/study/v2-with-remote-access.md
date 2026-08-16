# Space Zero V2 with Remote Access

## Status

Architecture study and proposed direction. This document is not an accepted ADR or an implementation specification.

ADR 0025 supersedes this study where they differ on Workspace Host deployments and Local Host lifecycle. In particular, v0.1 uses a separate Desktop-managed Local Host that stops on explicit Desktop quit, does not plan customer-managed self-hosting, and reserves Remote Host for future Space Zero-managed on-demand and dedicated offerings.

ADR 0026 accepts HTTP/JSON for commands and queries, authenticated SSE over streaming `fetch()` for ordered events, and short-lived scoped bearer capabilities for local and future remote client sessions. A universal WebSocket protocol is not selected for the initial implementation.

ADR 0027 selects Effect across Host Contracts, Workspace Host, Pi Adapter, and Client Runtime while keeping React and generic UI Effect-free. ADR 0028 selects SQLite-backed event sourcing for the Project Session domain, rebuildable relational projections, durable command receipts, and a strict boundary between Space Zero Session history and private Pi transcripts.

ADR 0029 defines one initial Project Session as one Pi conversation, event aggregate, managed worktree/branch, and workflow. It branches from the registered checkout's committed current `HEAD`, uses centralized Local Host worktrees, fails closed on identity mismatch, and treats provisioning, quit, archive, deletion, and recovery as explicit durable lifecycle behavior.

## Purpose

Space Zero's current implementation proved many product ideas, but feature breadth grew faster than confidence in the core experience. The application now does many things without making one workflow feel exceptionally reliable.

V2 should not redescribe every existing feature or discard the knowledge gained from V1. The current implementation remains a draft and reference. V2 resets the architectural foundation and delivery sequence around one dependable agent workflow while preserving the larger product vision.

## Product Direction

### Long-term vision

Space Zero is the workspace where builders direct agents and take their work from idea to shipped software without losing context across devices.

### Initial product wedge

Reliably launch, supervise, review, and ship the work of one coding agent running in an isolated workspace.

The initial loop is:

1. Select a repository.
2. Create an isolated Project Session.
3. Give the Pi-powered agent a task.
4. Observe activity and answer questions or approvals.
5. Disconnect and reconnect without losing meaningful history.
6. Review changed-file diffs.
7. Request follow-up work when needed.
8. Commit and push the result.
9. For GitHub repositories, create or update a pull request.

Files, Terminal, Browser, Knowledge Base, Command Palette, and other V1 capabilities are not rejected. They return incrementally only when they strengthen this loop and the existing foundation is dependable.

## Deployment Goals

The architecture must eventually support three Workspace Host deployments:

1. **Local host** — installed with Space Zero Desktop and running on the builder's computer.
2. **Self-hosted remote host** — installed on a builder-controlled VPS.
3. **Space Zero Cloud host** — provisioned by Space Zero as a complete isolated cloud workspace for long-running agent jobs.

Desktop is the first client. A future web client and mobile companion supervise remote sessions. Mobile is not intended to be a miniature IDE; it focuses on status, conversation, approvals, notifications, interruption, follow-up instructions, summaries, and focused diff review.

## Core Architectural Shift

V1 is primarily an Electron application whose main process owns native behavior, application services, persistence, credentials, and agent orchestration. That model makes Electron IPC the center of the product and ties agent lifecycle to the desktop application.

V2 should instead be centered on a headless **Workspace Host**:

```text
Space Zero Desktop        Future Web        Future Mobile
        │                      │                  │
        └──────── typed authenticated protocol ──┘
                               │
                               ▼
                       Workspace Host
                               │
             ┌─────────────────┼──────────────────┐
             │                 │                  │
        Agent runtime     Workspace/Git     Durable state
             │
             ▼
             Pi
```

The Workspace Host owns the behavior that must continue without an open Electron window:

- Project Session lifecycle
- Pi agent runtime and normalization of Pi events
- Managed repository/worktree state
- Git operations
- Tool execution and approval state
- Durable session events and projections
- Changed-file and diff state
- Reconnection and subscription cursors

Electron remains the desktop shell and a platform adapter. It installs, starts, monitors, and connects to the local Workspace Host, but it is no longer the permanent owner of core session behavior.

## Workspace Host

### Local lifecycle

For the first milestone, the Workspace Host is bundled with Space Zero Desktop and installed or started automatically. It runs as a background user service.

Quitting Electron does not terminate the host or active agents. Reopening Electron reconnects and catches up from durable state. Stopping the host is an explicit operation rather than a side effect of closing the desktop client.

A separately installed CLI or daemon is deferred until self-hosted VPS support is implemented, but the bundled host must be internally deployable without Electron.

### Session placement

A Project Session belongs to exactly one Workspace Host. That host may be local, self-hosted, or Space Zero-managed.

Clients can reconnect to and supervise the Session, but they do not move its running workspace between hosts. Cross-host migration is not an initial requirement.

### Session isolation

Every Project Session owns an isolated workspace.

- Local Sessions use a dedicated managed Git worktree.
- Self-hosted and managed cloud Sessions use an isolated workspace with equivalent repository and branch guarantees.
- A Session must fail closed if its isolated workspace identity is missing or invalid; it must never silently fall back to the registered base checkout.

### Resumability

Cloud Project Sessions are resumable. Compute may stop when idle, but repository state, agent context, meaningful events, and artifacts remain available until explicit deletion or expiry under a retention policy.

True infrastructure suspend/resume may be implemented later. The domain model must not treat agent completion as workspace destruction.

## Client Architecture

### Desktop

The desktop client remains an Electron-specific React renderer. V2 does not require the renderer to run unchanged in a browser.

Electron IPC is limited to desktop-native responsibilities such as:

- Host installation, startup, discovery, and health
- Secure delivery of a local endpoint and bootstrap credential
- Native application lifecycle
- Native dialogs and operating-system integration
- Desktop updates

Core behavior—including Sessions, messages, tool activity, approvals, Git state, diffs, and task-to-ship actions—uses the Workspace Host protocol.

### Shared client foundation

Desktop, web, and mobile may have separate interfaces, but should share:

- Protocol contracts
- Authentication concepts
- Connection and reconnection behavior
- Event cursor and catch-up semantics
- Domain projections where platform-independent
- Stable Space Zero error codes

Mobile and web should not need knowledge of Pi SDK event structures or Workspace Host implementation details.

## Protocol

The local desktop client uses the same domain protocol intended for remote clients. There must not be a complete Electron-only implementation of core behavior beside a separate remote implementation.

The protocol should support:

- Typed commands and queries
- Typed event subscriptions
- Authentication and operation-level authorization
- Idempotent command identity where retries are possible
- Reconnection with a last-seen event cursor
- Snapshot or projection loading followed by incremental catch-up
- Explicit version compatibility
- Structured errors that do not expose secrets or provider payloads

The transport is not selected by this study. WebSocket, HTTP, RPC frameworks, and serialization choices require a separate implementation decision. The stable contract is more important than copying T3 Code's Effect stack.

## Durable Session Model

Meaningful session activity must survive client and Workspace Host restarts. This includes:

- User and assistant messages
- Agent run state
- Tool calls and results
- Approval requests and decisions
- Agent questions and user answers
- Interruptions, failures, and completion
- Workspace and Git status relevant to the Session

The recommended foundation is an append-oriented **Session Event Journal** plus projected current state.

This is deliberately narrower than event-sourcing the entire application. Domain events should represent meaningful Session facts, not generic internal plumbing. High-volume streaming text should be batched into durable message updates rather than storing every token as a separate event.

The host persists meaningful events before publishing them. A reconnecting client loads current projected state and subscribes from a known cursor without relying on the previous renderer instance.

## Agent Harness Boundary

Pi remains the only initial agent harness. V2 should integrate it deeply rather than build a speculative multi-harness framework.

Pi SDK types and raw events stay inside a host-side adapter. Clients receive stable Space Zero concepts such as:

- Session started or stopped
- Turn started, completed, interrupted, or failed
- Message content updated
- Tool activity started or completed
- Approval requested or resolved
- Agent question requested or answered
- Changed files updated

A second harness may justify a broader abstraction later. Until then, the boundary should hide Pi volatility without pretending all harnesses are already understood.

## Git and GitHub

The first milestone includes the complete narrow task-to-ship path rather than ending with abandoned worktree changes.

- Git repositories can produce commits and push through a configured remote.
- GitHub repositories additionally support creating or updating pull requests.
- GitLab and other forge-specific pull-request APIs are deferred.
- V2 does not require a complete visual Git client, arbitrary branch management UI, or every staging operation.

### GitHub authentication

V2 preserves the security properties of ADR 0012:

- GitHub App with device authorization
- Repository access limited by GitHub App installation grants
- Space Zero owns token refresh and authorization checks
- Tokens never enter clients, agent transcripts, Git remotes, logs, or ordinary workspace environments
- Authenticated Git uses a temporary restricted `GIT_ASKPASS` path
- Repository authorization is revalidated before privileged operations

Credential ownership must adapt to deployment:

- A trusted local credential service owns protected credentials for local hosts.
- The future Space Zero control plane owns managed-cloud credentials and brokers narrowly scoped, short-lived authorization to a cloud Workspace Host.
- A Workspace Host must not persist the user's long-lived GitHub refresh token inside a Project Session workspace.

ADR 0012 requires revision before managed cloud is implemented because it currently assumes Electron main and no hosted Space Zero backend.

## Authentication and Trust Boundaries

Authentication is required from the first local protocol even when the host binds only to loopback.

The first milestone should provide:

- Loopback-only binding by default
- A generated, short-lived bootstrap credential supplied securely to Electron
- An authenticated client session
- Authorization at trusted host command handlers, not only in UI controls
- Fail-closed handling of missing, expired, unknown, or mismatched credentials
- No long-lived credential in URLs, logs, renderer storage, or Session events

Remote device pairing, Space Zero accounts, proof-of-possession, tunnel brokering, and internet-facing host discovery are later decisions. The local protocol must not assume that every process able to reach a port is trusted.

## Future Space Zero Control Plane

Managed cloud requires a control plane separate from each Workspace Host:

```text
Space Zero Control Plane
├── User and device identity
├── Workspace provisioning
├── Host registration and discovery
├── Lifecycle: create, start, suspend, resume, expire, delete
├── Credential brokering
├── Notification routing
├── Usage and retention policy
└── Endpoint and protocol-version routing
```

The control plane should not own active agent orchestration or repository filesystem state. Those belong to the Workspace Host. It may store account-level metadata and enough Session metadata to locate and manage a host.

The detailed control-plane/data-plane topology is deferred. In particular, this study does not decide whether client event traffic is direct to the host, proxied, or relayed under different network conditions.

## Relationship to the T3 Code Remote-Access Study

The architecture in `docs/study/t3remote-accesss.md` validates the server-owned model:

- Agent processes, repositories, terminals, Git, and SQLite belong to a host service.
- Electron, web, and mobile are clients.
- Clients issue domain commands and subscribe to orchestration events.
- Remote supervision is not remote-desktop streaming.
- A relay/control plane can be separate from the workspace data plane.

Space Zero should borrow these principles, not automatically copy T3 Code's implementation choices. Effect, full event sourcing, Cloudflare Tunnel, its provider registry, and its exact authentication stack require independent justification.

Space Zero also has an additional goal: managed cloud provisioning. T3 Code primarily connects clients to an already-running user computer; Space Zero Cloud must eventually create and lifecycle-manage the isolated computer or container where the Workspace Host runs.

## Current-to-Target Assessment

### Keep

These V1 decisions remain aligned with V2:

- Electron as the desktop shell
- Secure renderer isolation and narrow native bridges
- Pi-first agent strategy
- Project Sessions as isolated coding workspaces
- Managed Git worktrees for local Project Sessions
- GitHub App installation-based repository authorization
- Git CLI for local repository operations
- GitHub API for GitHub workflows
- Typed contracts at trust boundaries
- Diff review as part of builder trust
- Task-to-ship as the differentiating workflow

### Adapt

These concepts remain useful but need a new owner or contract:

| V1 concept | V2 adaptation |
| --- | --- |
| Electron main application services | Move long-running Session behavior into Workspace Host services |
| Preload/IPC contracts | Retain only for desktop-native behavior; introduce shared host protocol contracts |
| Main-owned SQLite | Move Session event journal and host projections to Workspace Host persistence; keep truly desktop-local settings with desktop where appropriate |
| Pi utility process | Make Pi execution an internal Workspace Host concern |
| Agent event projection | Persist and project host-owned domain events for reconnectable clients |
| Main-owned Git and GitHub operations | Move Session Git operations to the host; keep long-lived credential ownership outside isolated Session workspaces |
| Session cleanup | Make cleanup a host-owned lifecycle use case with fail-closed workspace guarantees |
| Renderer stores | Rebuild as projections of host state instead of independent authorities for durable Session behavior |

### Replace

These V1 assumptions conflict with the target direction:

- Electron IPC as the primary product boundary
- Electron main as the permanent owner of agent and Session lifecycle
- Agent shutdown as a consequence of closing Electron
- Renderer presence as a requirement for approval or activity continuity
- In-memory-only meaningful Session activity
- Local-only process assumptions inside core Session contracts
- Separate local and remote implementations of core behavior

### Defer

These existing capabilities remain references but are not part of the first V2 foundation unless required by the narrow agent loop:

- Full Files editing experience
- Embedded Browser and preview/debugging
- Full Terminal UI
- Knowledge Base
- Command Palette breadth
- General Workspace Tools beyond the initial Session workflow
- Multiple agent harnesses
- Multiple forge-specific integrations
- Full Git client behavior
- Mobile and web implementation
- Managed cloud provisioning infrastructure
- Host migration between machines

## Suggested Target Repository Shape

This is illustrative rather than a final package decision:

```text
apps/
  desktop/                 Electron application and desktop-native adapters
  workspace-host/          Headless host executable/service
  web/                     Future remote supervision client
  mobile/                  Future mobile companion

packages/
  host-contracts/          Versioned commands, queries, events, errors
  client-runtime/          Connection, auth session, reconnect, projections
  session-domain/          Stable Session rules and event vocabulary
  pi-adapter/              Pi SDK integration owned by the host
```

The repository should not create all future packages on day one. Add a package only when the first vertical slice needs the boundary. The important initial separation is between desktop-native concerns, Workspace Host behavior, and stable protocol contracts.

## Minimal Local-First Rebuild Sequence

### Phase 0: preserve V1

- Create a permanent V1 draft/reference branch and tag; exact names are still to be chosen.
- Keep V1 out of the active V2 source tree rather than copying it into a `legacy/` directory.
- Preserve relevant docs and implementation history for selective study.
- Freeze feature expansion while the new foundation is established.

### Phase 1: host skeleton and authenticated connection

Prove that Electron can install/start a separate host, authenticate, query health and version, disconnect, and reconnect.

No agent UI breadth is required yet.

### Phase 2: one durable Pi Session

Create one isolated managed worktree, start Pi in the Workspace Host, submit a task, persist normalized Session events, stream them to Electron, and recover state after renderer and host restart.

### Phase 3: supervision and safety

Add agent activity, questions, approvals, interruption, failure handling, background continuation after Electron quits, and deterministic reconnection.

### Phase 4: diff review and follow-up

Project changed files and render reviewable diffs. Allow the builder to request corrections through the same Session. Direct file editing is deferred.

### Phase 5: task to ship

Add commit, configured-remote push, and GitHub pull-request creation/update through trusted host services and the preserved GitHub App security model.

### Phase 6: hardening

Exercise restart recovery, duplicate commands, interrupted streams, invalid worktree identity, credential expiry, Git failures, approval races, concurrent clients, resource cleanup, and upgrade compatibility.

Only after this loop is dependable should V1 capabilities be reintroduced individually.

## Quality Gates

V2 should not repeat V1's breadth-first delivery pattern. Each phase must have explicit behavioral verification before the next capability is added.

At minimum, the foundation should prove:

- The renderer cannot directly access Node.js, secrets, or host internals.
- Unauthenticated and unauthorized host operations fail closed.
- Project Sessions never execute in the registered base checkout.
- Agent work continues after Electron closes.
- Reconnection does not duplicate commands or lose meaningful events.
- Pending approval state survives client disconnection and is Session-scoped.
- Host restart restores a coherent Session projection.
- Diff state corresponds to the Session workspace and branch.
- GitHub credentials do not enter the workspace, agent environment, protocol payloads, or logs.
- Commit, push, and pull-request outcomes report partial failure accurately.
- Cleanup cannot claim success while an agent or managed workspace remains in an unknown state.

## ADR Impact

This direction is significant enough to require ADRs before implementation. At minimum:

1. **Workspace Host as the owner of Project Session execution**
2. **Authenticated versioned host protocol shared by local and remote clients**
3. **Durable Session Event Journal and projection model**
4. **Background local host lifecycle independent of Electron**
5. **Credential ownership and brokering across local and managed-cloud deployments**

Existing ADRs should not be silently edited to imply they always described V2. Mark superseded or amended decisions explicitly. Likely review targets include:

- ADR 0002: Electron process boundaries and typed IPC
- ADR 0003: main-owned SQLite
- ADR 0005: Workspace Tools control plane
- ADR 0006: Pi harness in an Electron utility process
- ADR 0012: GitHub authentication ownership
- ADR 0013: managed Project Session worktrees
- ADR 0014: Terminal process ownership
- ADR 0016: Browser process ownership
- ADR 0020: workspace and Chat Context lifecycle

## Documentation Impact

`docs/context.md` currently describes the durable V1 product model in substantial detail. Do not rewrite every feature before V2 begins.

Instead:

1. Preserve the V1 documentation with the V1 branch/tag.
2. Update only the durable top-level purpose, Workspace Host terminology, deployment model, and Session ownership rules needed for V2.
3. Keep existing feature contracts as references until a feature is selected for V2 reintroduction.
4. Reconcile each returning feature with the host/client boundary at implementation time.

## Risks

### Rebuilding breadth instead of the foundation

Creating host, desktop, web, mobile, cloud, Terminal, Browser, Files, and Knowledge Base together would recreate the original delivery problem. The local agent loop must remain the only initial vertical slice.

### Premature distributed-systems complexity

Remote access introduces retries, identity, authorization, compatibility, concurrency, and partial failure. The local host should exercise the same contracts first, but V2 should not build managed cloud infrastructure before the local boundary is proven.

### Copying T3 Code too literally

T3 Code is evidence for a host/client architecture, not a mandate for Effect, its event store, its provider model, or its networking stack.

### Speculative abstractions

Multi-harness frameworks, generic forge layers, universal service registries, and complete deployment abstractions should wait for a second concrete requirement.

### Credential centralization

Managed cloud makes the future Space Zero control plane highly security-sensitive. Long-lived credentials must remain outside Session workspaces and require a dedicated threat model before cloud implementation.

### Carrying V1 coupling forward

Selective reuse is appropriate only when a V1 module already fits the new owner and contract. Copying implementation wholesale risks preserving Electron lifecycle assumptions and duplicated state ownership.

## Recommended Next Step

Produce a focused implementation architecture for Phases 1 and 2 only:

- Inspect current agent, Session, worktree, persistence, GitHub, and IPC modules.
- Identify code that can be reused without preserving Electron ownership.
- Define the smallest Workspace Host boundary and domain vocabulary.
- Draft the Workspace Host and protocol ADRs.
- Define acceptance tests for background lifecycle, isolation, durable events, and reconnection.

Do not begin by porting V1 features. Begin by proving one authenticated Electron-to-host connection and one durable isolated Pi Session.
