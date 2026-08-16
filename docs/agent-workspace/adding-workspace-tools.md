# Adding Workspace Tools

Workspace Tools are typed, agent-facing capabilities that may let a Project Session inspect or operate approved Space Zero behavior through Workspace Host application services.

The archived v0 implementation routed tools through Electron main. That layout is historical and must not be reused. The initial v0.1 slice does not need to implement the full Workspace Tool catalog, delegation, activity history, or UI-control tools. Use this guide when a concrete Project Session capability requires a Workspace Tool.

## Boundary

```text
Pi conversation
  -> Pi Adapter custom-tool boundary
  -> Workspace Host Workspace Tool registry and safety policy
  -> Workspace Host application service
  -> authorized repository / Git / filesystem / process adapter
```

A human Host Protocol command and an agent Workspace Tool may have different entrypoints and metadata, but they should call the same Workspace Host application service when they perform the same use case.

Electron main is not the Workspace Tool control plane. It remains responsible for Desktop-native behavior and Local Host supervision.

## Required properties

Each implemented tool needs:

- a stable dotted name such as `projects.list` or `sessions.get-status`;
- an Effect Schema input contract;
- a narrow structured result contract;
- explicit scope and safety metadata;
- a handler that calls an application service rather than persistence or external adapters directly;
- cancellation and cleanup behavior compatible with the owning Project Session; and
- tests for authorization, validation, success, failure, interruption, and secret redaction.

Tool results contain structured data rather than polished conversational prose. Pi interprets and summarizes results for the builder.

## Placement

Tool definitions belong near their owning Workspace Host feature services, for example:

```txt
apps/workspace-host/src/features/projects/
  projects.service.ts
  projects.tools.ts
```

Pi-specific registration and event translation remain in:

```txt
packages/pi-adapter/
```

Serializable client-visible tool lifecycle events or approval contracts belong in:

```txt
packages/host-contracts/
```

Do not place tool implementations in Desktop renderer, preload, Electron main, Host Contracts, or Client Runtime.

## Handler rules

A Workspace Tool handler may:

- validate already-authorized product input;
- translate tool input into a Workspace Host application command;
- call the owning application service;
- map typed product failures into a narrow tool result; and
- attach safe operation metadata needed for Session history.

A handler must not:

- access SQLite repositories directly;
- accept or trust arbitrary filesystem paths from Pi;
- bypass Project/Session/worktree identity checks;
- invoke renderer internals or raw Electron IPC;
- return credentials, private paths, raw provider payloads, or Pi internals;
- duplicate application policy already owned by a Host service; or
- automatically retry an ambiguous external side effect after interruption.

## Workspace and Session authority

Project Session tools operate only within the authenticated managed worktree and capabilities of their owning Session. They never fall back to the registered base checkout.

Tool execution participates in the Project Session lifecycle:

- accepted calls and meaningful outcomes use versioned Session event contracts where product history requires them;
- provider token fragments and noisy internal progress are not persisted as individual domain events;
- interruption or Host crash records an explicit interrupted, unknown, or recovery-required outcome when completion is ambiguous; and
- destructive behavior fails closed when resource identity cannot be proven.

## UI-control tools

Do not add a UI-control Workspace Tool merely to automate renderer internals. If a future approved use case requires client presentation, Workspace Host may publish a typed client-facing intent through the Host Protocol after authorization and safety checks. Each client decides how to present supported intents.

Browser automation, arbitrary UI scripting, and direct renderer manipulation require separate product and security decisions.

## Registry

Create the smallest explicit registry needed by the current Pi Session slice. The registry should:

- expose only tools approved for the Session kind and capability scope;
- reject duplicate names and invalid definitions;
- make tool availability deterministic for Session restore;
- keep safety and confirmation policy outside individual handlers where practical; and
- register tools with Pi only through Pi Adapter.

Do not create aggregate tools or a generic plugin system speculatively.

## Testing

Test Workspace Tools through the public registry/application-service boundary with deterministic Pi Adapter fakes. Use real SQLite, Git, and temporary worktrees when those implementations are part of the behavior being verified.

Required high-risk coverage includes:

- invalid input and unknown tool denial;
- wrong Session, Project, worktree, or capability scope;
- path traversal and symlink boundaries;
- safety/confirmation denial;
- interruption before and after an external side effect;
- redaction from results, events, and logs; and
- no fallback to renderer, Electron main, base checkout, or direct database access.

## References

- `docs/feature-architecture.md`
- `docs/coding-standards.md`
- ADR 0027 — Effect boundaries
- ADR 0028 — Project Session events and persistence
- ADR 0029 — Project Session/worktree identity
- ADR 0032 — capability authorization
- ADR 0035 — crash recovery and ambiguous work
- ADR 0037 — Host Protocol implementation

Archived ADR 0005 documents the v0 approach only and is not normative for v0.1.
