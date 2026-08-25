# OpenCode Architecture Analysis

## Short answer

OpenCode is built around a **headless agent server with multiple thin clients**:

```text
TUI / Web UI / IDE extensions / SDK
                 │
        HTTP commands and queries
        SSE event subscriptions
        WebSocket for PTY
                 │
                 ▼
          OpenCode server
                 │
      Sessions / agent runtime
      tools / LSP / MCP / PTY
      providers / filesystem / Git
                 │
             SQLite + files
```

This is very close to the **Workspace Host** direction proposed in `docs/study/v2-with-remote-access.md`.

However, Space Zero does **not currently have an HTTP server implementation**. Today it uses:

```text
Renderer → preload → Electron IPC → main → MessagePort → Pi utility process
```

The HTTP/remote Workspace Host is a proposed architecture study, and the transport is explicitly undecided in `docs/study/v2-with-remote-access.md`.

## 1. OpenCode's high-level architecture

### Clients are separated from the agent backend

OpenCode supports several clients:

- Terminal UI
- Web UI
- IDE extensions
- Generated SDK clients
- Third-party API clients

Running normal `opencode` starts both the TUI and an HTTP server. The TUI talks to that server rather than directly owning the agent runtime.

Running:

```bash
opencode serve
```

starts the server without the TUI.

This gives OpenCode a logical client/server boundary, although the normal TUI and server do not necessarily need to be separate long-lived operating-system services.

Reference: [OpenCode server documentation](https://opencode.ai/docs/server/).

### Server responsibilities

The OpenCode server owns:

- Projects and workspace paths
- Agent sessions and messages
- Provider/model access
- Agent execution loop
- Built-in tools
- Permission requests
- Filesystem operations
- Git/diff information
- LSP servers
- MCP connections
- PTY terminal processes
- Configuration and provider authentication
- Session persistence

This makes the server a **privileged workspace capability host**, not merely a chat API.

## 2. OpenCode's transport model

OpenCode uses different transports for different interaction patterns.

### HTTP for commands and queries

Its server exposes an OpenAPI 3.1 API at:

```text
GET /doc
```

Representative endpoints include:

```text
POST /session
GET  /session/:id
GET  /session/:id/message
POST /session/:id/prompt_async
POST /session/:id/abort
POST /session/:id/permissions/:permissionID
GET  /session/:id/diff
GET  /file/content
GET  /lsp
GET  /mcp
```

This is a conventional command/query interface.

The OpenAPI definition is also used to generate the OpenCode SDK. That reduces drift between the server and clients.

### SSE for agent events

OpenCode uses Server-Sent Events:

```text
GET /event
GET /global/event
```

The stream carries:

- Connection events
- Session changes
- Message updates
- Tool activity
- Permission requests
- Status changes
- Other internal bus events

SSE is appropriate because most agent streaming is one-directional:

```text
Server → client
```

Clients still send commands through normal HTTP requests.

### WebSocket for PTY

OpenCode uses WebSocket where bidirectional streaming is actually needed:

```text
Client terminal input ⇄ PTY output
```

It does not appear to use one universal WebSocket protocol for all application operations.

This is a clean transport split:

| Interaction | Transport |
|---|---|
| Commands and queries | HTTP |
| Agent/session events | SSE |
| Interactive terminal | WebSocket |

## 3. OpenCode's session and agent model

A session is a durable backend entity, not just a currently open UI conversation.

OpenCode supports:

- Create/update/delete
- Messages and message parts
- Running status
- Abort
- Fork
- Child sessions
- Revert/unrevert
- Summarization
- Permission responses
- Session diffs
- Sharing
- Todos

The agent execution loop runs server-side:

```text
Receive prompt
  → select agent/model
  → persist user message
  → build model context
  → call model
  → stream output
  → execute tools
  → persist messages/tool parts
  → repeat until complete
```

The UI is therefore a projection of backend session state. It should not independently own the authoritative agent lifecycle.

This aligns strongly with Space Zero V2's proposed rule that clients must not know Pi's raw SDK event model.

## 4. Tools, LSP and MCP

OpenCode's server also acts as a process and capability broker.

### Tools

The server resolves tools from:

- Built-in OpenCode tools
- Agent configuration
- Project/global custom tools
- Plugins
- MCP servers
- Model and permission settings

Tools can read and modify files, execute commands, search code and invoke external capabilities.

### LSP

When enabled, OpenCode:

1. Detects the language from a file extension.
2. Starts the appropriate language server.
3. Reuses the server for that workspace.
4. Collects diagnostics.
5. Feeds those diagnostics back to the agent.

LSP processes are server-owned subprocesses, not client-owned services.

Reference: [OpenCode LSP documentation](https://opencode.ai/docs/lsp/).

### MCP

The backend also owns:

- Local MCP subprocesses
- Remote MCP HTTP connections
- MCP OAuth state
- Tool exposure to the agent

Architecturally, this confirms that the server is the trusted execution environment.

## 5. OpenCode persistence

Current OpenCode source uses SQLite for durable data such as:

- Sessions
- Messages
- Message parts
- Todos
- Queued input
- Context state

It also stores configuration and provider credentials in backend-owned files.

This provides durable entities, but its event subscription design appears less rigorous than the Space Zero V2 proposal:

- OpenCode publishes live SSE bus events.
- Heartbeats detect dead connections.
- Clients can reload sessions/messages after reconnecting.
- No documented durable event cursor or `Last-Event-ID` replay contract was found.

Therefore, OpenCode appears to use:

```text
Durable current state + transient event notifications
```

Space Zero V2 proposes:

```text
Durable event journal
  → durable projections
  → publish events only after persistence
  → reconnect from a last-seen cursor
```

That is a stronger reconnection guarantee.

## 6. Comparison with current Space Zero

### Current Space Zero

```text
React renderer
  │ window.spacezero
  ▼
Electron preload
  │ typed Electron IPC
  ▼
Electron main
  ├── SQLite
  ├── Git/GitHub
  ├── files
  ├── terminal
  ├── application services
  └── agent utility-process host
          │ MessagePort
          ▼
      Pi utility process
          ├── Pi AgentSession
          ├── project tools
          ├── transcripts
          └── provider/model runtime
```

Relevant decisions:

- `docs/adr/archive/v0/0002-secure-electron-process-boundaries-and-typed-ipc.md`
- `docs/adr/archive/v0/0006-pi-agent-harness-in-utility-process-via-sdk.md`

### Main difference

OpenCode places core behavior behind a reusable HTTP server contract.

Space Zero currently places it behind Electron main and preload IPC:

| Concern | OpenCode | Current Space Zero |
|---|---|---|
| Primary boundary | HTTP server | Electron IPC |
| Agent runtime | Server | Utility process |
| Core service owner | Server | Electron main |
| Multiple client support | Built in | Not currently |
| Generated client | OpenAPI SDK | Shared TypeScript IPC types |
| Events | SSE | Electron events/MessagePort |
| Terminal | Server PTY + WebSocket | Main PTY + Electron IPC |
| Lifecycle | OpenCode process/server | Electron application lifecycle |
| Remote use | Supported by server binding | Not currently supported |

OpenCode is consequently much closer to the V2 direction than the current implementation.

## 7. Comparison with the proposed Workspace Host

The proposed Space Zero topology is:

```text
Desktop / Web / Mobile
          │
 typed authenticated protocol
          ▼
     Workspace Host
          ├── Project Sessions
          ├── Pi runtime
          ├── worktrees and Git
          ├── approvals
          ├── durable events
          ├── projections and diffs
          └── reconnect cursors
```

Reference: `docs/study/v2-with-remote-access.md`.

### Where OpenCode validates our direction

OpenCode demonstrates that the following architecture is practical:

1. **The agent runtime belongs behind a server boundary.**
2. **Clients should be replaceable.**
3. **Agent execution should not be implemented inside the UI.**
4. **HTTP is sufficient for commands and queries.**
5. **SSE works well for agent event streaming.**
6. **WebSocket is best reserved for PTY-like bidirectional streams.**
7. **An API schema can generate typed clients.**
8. **LSP, tools and MCP should execute server-side.**
9. **Sessions should remain available independently of the active client.**

These points strongly support the Workspace Host direction.

### Where our proposed design is stronger

#### Background lifecycle

Space Zero requires:

> Quitting Electron does not stop the host or active agents.

Normal OpenCode starts its TUI and server together. It can run as a standalone server, but it does not define the same desktop-managed background-service lifecycle as a core product invariant.

#### Durable reconnection

Space Zero explicitly requires:

- Persist before publishing
- Last-seen event cursor
- Snapshot plus catch-up
- Pending approvals surviving disconnection
- Idempotent command IDs
- Host restart recovery

OpenCode exposes durable session state and live SSE events, but does not document this complete event-journal/replay protocol.

#### Session isolation

Space Zero requires each Project Session to use a managed worktree and fail closed if its workspace identity is invalid.

OpenCode is project/directory-oriented, but does not impose Space Zero's product-level "one managed isolated workspace per Project Session" invariant.

#### Protocol abstraction

OpenCode's public API includes OpenCode-specific concepts.

Space Zero intends to expose stable domain concepts and keep raw Pi types inside the host adapter:

```text
Pi event → Space Zero domain event → client projection
```

That is important if Pi evolves independently of the product protocol.

## 8. Security comparison

This is the largest area where Space Zero should **not** copy OpenCode literally.

### OpenCode

By default:

- Binds to `127.0.0.1`
- Authentication is optional
- Password protection uses HTTP Basic authentication
- Remote binding to `0.0.0.0` is possible
- CORS origins are configurable
- mDNS discovery is available

The server becomes authenticated only when `OPENCODE_SERVER_PASSWORD` is configured.

That may be acceptable for a developer tool, but the server can:

- Read and modify repositories
- Execute commands
- Access provider credentials
- Start language servers
- Run tools
- Control terminal processes

Loopback is not authentication. Any local process capable of reaching the port may potentially call the API.

### Space Zero V2 requirement

`docs/study/v2-with-remote-access.md` correctly requires:

- Authentication even on loopback
- Generated short-lived bootstrap credentials
- Authenticated client sessions
- Handler-level authorization
- No long-lived credentials in URLs or renderer storage
- Fail-closed unknown or expired credentials
- Later support for remote pairing and secure tunnelling

That is significantly stronger than OpenCode's default local-server model.

## 9. Comparison with the T3 study

T3 uses:

```text
Typed Effect RPC over authenticated WebSocket
```

OpenCode uses:

```text
OpenAPI HTTP + SSE + specialized PTY WebSocket
```

| Concern | OpenCode | T3 |
|---|---|---|
| Commands | HTTP | WebSocket RPC |
| Events | SSE | WebSocket subscriptions |
| Terminal | WebSocket | Same RPC/WebSocket architecture |
| API schema | OpenAPI | Effect schemas/contracts |
| Event persistence | Durable state, live bus events | Transactional event store |
| Retry idempotency | Not central in documented API | Command receipts/idempotency |
| Local authentication | Optional Basic auth | Pairing and scoped bearer tokens |
| Remote authentication | Basic auth/direct exposure | Short-lived tickets, DPoP, relay |
| Remote control plane | No substantial equivalent | T3 Connect relay/control plane |

OpenCode is simpler and probably a better reference for the **initial transport**. T3 is stronger as a reference for:

- Authentication
- Device pairing
- Durable event processing
- Command idempotency
- Internet remote access
- Control-plane/data-plane separation

## 10. Recommendation for Space Zero

Use a hybrid of the OpenCode and T3 approaches.

### Adopt from OpenCode

#### HTTP/OpenAPI for commands and queries

For example:

```text
POST /sessions
GET  /sessions/:id
GET  /sessions/:id/projection
POST /sessions/:id/prompts
POST /sessions/:id/interrupt
POST /sessions/:id/approvals/:approvalId
GET  /sessions/:id/diff
```

Benefits:

- Easy debugging
- Straightforward versioning
- Generated typed client
- Works across Electron, web and mobile
- Natural request/response semantics

#### SSE for domain events

For example:

```text
GET /sessions/:id/events?after=<cursor>
```

Use it for:

- Message updates
- Run status
- Tool activity
- Approval requests
- Agent questions
- Changed-file updates

#### WebSocket only when PTY returns

Do not introduce a universal WebSocket merely because the system streams events. SSE is simpler for one-way agent output.

### Adopt from T3 and our V2 study

Add the guarantees OpenCode does not visibly provide:

- Mandatory local authentication
- Short-lived bootstrap credentials
- Scoped client sessions
- Operation-level authorization
- Idempotency keys for retryable commands
- Durable event cursor
- Snapshot plus event catch-up
- Persist-before-publish
- Pending approval recovery
- Protocol-version negotiation
- Secure remote pairing and tunnelling

### Recommended local topology

```text
Electron main
  ├── starts/discovers Workspace Host
  ├── receives endpoint + one-time bootstrap secret
  └── passes an authenticated client capability to renderer
                │
                ▼
Workspace Host on 127.0.0.1:<ephemeral-port>
  ├── HTTP commands/queries
  ├── authenticated SSE
  ├── Session event journal
  ├── projections
  ├── Pi adapter
  ├── managed worktrees
  └── Git/diff services
```

The renderer should never receive:

- Provider credentials
- Raw filesystem authority
- Arbitrary command execution
- Host administrative credentials
- Pi SDK objects

## Final assessment

**OpenCode is the closest concrete reference for Space Zero's proposed local Workspace Host protocol.** Its OpenAPI HTTP + SSE design is simpler and more suitable for our first local vertical slice than copying T3's complete Effect RPC WebSocket stack.

But OpenCode should be treated as a reference for **service decomposition and transport**, not for the complete security and durability model.

The recommendation is:

> **OpenCode transport simplicity + T3 authentication discipline + Space Zero's durable Session journal and managed-worktree invariants.**

The most appropriate next architecture decision would be:

1. HTTP/OpenAPI for commands and queries.
2. SSE with durable cursors for Session events.
3. Mandatory authenticated loopback connections.
4. A Workspace Host lifecycle independent of Electron.
5. WebSocket deferred until interactive PTY support requires it.

## Sources

- [OpenCode documentation](https://opencode.ai/docs/)
- [OpenCode server documentation](https://opencode.ai/docs/server/)
- [OpenCode SDK documentation](https://opencode.ai/docs/sdk/)
- [OpenCode web documentation](https://opencode.ai/docs/web/)
- [OpenCode agents documentation](https://opencode.ai/docs/agents/)
- [OpenCode tools documentation](https://opencode.ai/docs/tools/)
- [OpenCode LSP documentation](https://opencode.ai/docs/lsp/)
- [OpenCode source snapshot](https://github.com/anomalyco/opencode/tree/976c1851727999983558f44952ef1b1efe57353a)
- `docs/study/v2-with-remote-access.md`
- `docs/study/t3remote-accesss.md`
- `docs/adr/archive/v0/0002-secure-electron-process-boundaries-and-typed-ipc.md`
- `docs/adr/archive/v0/0006-pi-agent-harness-in-utility-process-via-sdk.md`

## Study Session

Pi session ID: `01a009ab-3fab-7380-9161-3720a0e61b7b`
