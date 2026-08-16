# T3 Code Architecture Study

## Repository snapshot

Cloned to `/tmp/t3code-study` at commit [`2f486ab80c748b4d8e3d3b17e49b5a327cb93335`](https://github.com/pingdotgg/t3code/tree/2f486ab80c748b4d8e3d3b17e49b5a327cb93335).

There are no Git submodules. The repository already includes its Effect reference repositories under `.repos/`, so no additional clones were necessary.

## Short answer

T3 Code is **not remote desktop software**. The phone does not stream or control the desktop UI.

Instead:

1. A T3 Node server runs on the computer.
2. That server owns the coding-agent CLI processes, files, terminals, Git operations, and SQLite state.
3. Web, Electron, and mobile are clients of that server.
4. They communicate through a typed, authenticated **Effect RPC WebSocket**.
5. The mobile app sends domain commands such as “start turn”, “approve”, “interrupt”, or “write terminal input”.
6. The server translates those commands into calls to Codex, Claude Code, Cursor, Grok, or OpenCode running on the computer.
7. Results stream back to mobile as orchestration events.

This server-owned model is described in the canonical [architecture overview](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/docs/internals/overview.md#L5-L59).

## Technology stack

| Area | Stack |
|---|---|
| Monorepo | TypeScript ESM, pnpm 11 workspaces, Vite+ |
| Core architecture | Effect 4 beta, Effect Schema, Effect RPC, Effect Atom |
| Server/CLI | Node.js, Effect HTTP/WebSocket, `node-pty`, local provider subprocesses |
| Persistence | Local SQLite in WAL mode, event store plus projected read models |
| Web | React 19, Vite+, TanStack Router, Base UI, Lexical, Tailwind 4 |
| Desktop | Electron 41 wrapping the web app and bundled server |
| Mobile | Expo 56, React Native 0.85, React 19, React Navigation |
| Mobile native pieces | Native terminal, diff viewer, markdown renderer |
| Authentication | Environment-local OAuth-style sessions; Clerk for T3 Connect |
| Remote networking | Direct LAN/WAN, Tailscale Serve, SSH forwarding, Cloudflare Tunnel |
| Cloud relay | Cloudflare Worker, Effect, Clerk, Drizzle, PlanetScale Postgres/Hyperdrive |
| Testing/tooling | Vite+ test runner, Effect Vitest, tsgo, Oxlint, GitHub Actions |
| Releases | Electron Builder, Expo EAS, npm CLI bundle, Alchemy relay deployment |

The relevant manifests are:

- [Server dependencies](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/apps/server/package.json#L17-L52)
- [Web dependencies](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/apps/web/package.json#L14-L70)
- [Desktop dependencies](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/apps/desktop/package.json#L14-L38)
- [Mobile dependencies](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/apps/mobile/package.json#L45-L121)
- [Relay dependencies](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/infra/relay/package.json#L1-L31)

## Repository structure

```text
apps/
  server/       Node server, CLI, providers, SQLite, Git, terminal
  web/          React web client
  desktop/      Electron main/preload around the web client
  mobile/       Expo/React Native iOS and Android client
  marketing/    Astro marketing site

packages/
  contracts/        Typed schemas and RPC definitions
  client-runtime/   Shared web/mobile connection and domain state
  shared/           Runtime utilities
  ssh/              Desktop-managed SSH launching and forwarding
  tailscale/        Tailscale discovery and Serve integration
  effect-acp/       Agent Client Protocol support
  effect-codex-app-server/

infra/
  relay/         T3 Connect cloud control plane
```

`packages/client-runtime` is particularly important. Web and mobile use the same connection supervisor, authorization, RPC client, cache, and domain-state factories. Their primary difference is UI and platform adapters.

## Server architecture

```text
Mobile / Web / Desktop
        │
        │ Effect RPC over authenticated WebSocket
        ▼
T3 Node server
        │
        ├── Orchestration engine
        ├── SQLite event store and projections
        ├── Provider reactors
        ├── Git/checkpointing
        ├── Terminal and filesystem
        └── Provider adapters
                │
                ▼
Codex / Claude / Cursor / Grok / OpenCode
```

### Event sourcing

Client actions do not directly mutate UI/server state. The flow is:

```text
RPC command
  → command queue
  → pure decider
  → persisted orchestration events
  → projected read models
  → provider/checkpoint reactors
  → streamed updates to clients
```

Commands are serialized and persisted transactionally with their projections and command receipts. This gives retries idempotency and keeps the event log consistent with the UI read model. See [the event-sourcing flow](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/docs/internals/overview.md#L61-L89).

Each turn also creates hidden Git checkpoints, allowing exact diffs and workspace restoration.

### Provider integration

Five provider drivers are registered:

- Codex
- Claude
- Cursor
- Grok
- OpenCode

The registry is visible in [`builtInDrivers.ts`](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/apps/server/src/provider/builtInDrivers.ts#L23-L52).

Clients never call these providers directly. They dispatch orchestration commands. A server reactor ensures a provider session exists and routes the request through the appropriate adapter. Provider-specific output is normalized back into common orchestration events.

## Mobile remote control: direct pairing

This covers LAN, ordinary HTTPS, and Tailscale. Tailscale is just another reachable bearer endpoint; it is not a separate application protocol.

### 1. Start or expose the server

The desktop app or `npx t3 serve` starts the T3 server on the computer.

It can be reachable through:

- LAN address
- HTTPS reverse proxy
- Tailscale Serve
- SSH port forwarding
- T3 Connect tunnel

### 2. Generate a pairing URL

The server creates a one-time pairing credential and puts it in the URL fragment:

```text
http://192.168.1.10:3773/#token=PAIRING_CODE
```

Putting it after `#` prevents it from being sent to unrelated web servers.

### 3. Mobile exchanges the pairing credential

The mobile app:

1. Parses the pairing URL.
2. Fetches the server’s environment descriptor.
3. Exchanges the one-time pairing credential at `/oauth/token`.
4. Receives a scoped bearer access token.
5. Stores the environment, endpoint, and access token in Expo SecureStore.

The central implementation is [`preparePairingRegistration`](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/packages/client-runtime/src/connection/onboarding.ts#L86-L128).

The one-time pairing token is not reused after the exchange.

### 4. Mobile obtains a WebSocket ticket

The long-lived bearer token is deliberately not placed in the WebSocket URL.

For each connection, mobile sends:

```http
POST /api/auth/websocket-ticket
Authorization: Bearer <access-token>
```

It receives a short-lived ticket and connects to:

```text
ws://computer:3773/ws?wsTicket=<short-lived-ticket>
```

This is implemented in [`authorization/remote.ts`](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/packages/client-runtime/src/authorization/remote.ts#L131-L191).

### 5. Effect RPC session opens

The client constructs an Effect RPC protocol over the socket, calls `server.getConfig`, and starts domain subscriptions. The session itself performs one connection attempt; a higher-level supervisor owns reconnects and exponential backoff.

See [`RpcSessionFactory`](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/packages/client-runtime/src/rpc/session.ts#L68-L148).

### 6. Server authenticates and scopes the socket

The `/ws` route:

1. Verifies the ticket.
2. Resolves the environment session.
3. Creates an RPC layer bound to that session.
4. Tracks connection/disconnection.
5. Checks the required scope for every RPC method.

See [`websocketRpcRouteLayer`](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/apps/server/src/ws.ts#L2293-L2352).

A valid socket alone is not enough to call every operation.

### 7. Mobile controls the agent

Example:

```text
Mobile: thread.turn.start
  → Effect RPC
  → server orchestration command
  → persisted turn-start event
  → ProviderCommandReactor
  → Claude/Codex/etc. adapter
  → local provider process
  → normalized provider output
  → persisted events
  → thread subscription
  → mobile UI
```

The same path handles approvals, interruptions, user-input requests, diffs, Git actions, and terminal input.

## T3 Connect: remote control across the internet

T3 Connect solves NAT/firewall reachability without requiring inbound ports.

```text
Mobile
  │ HTTPS/WSS
  ▼
Cloudflare public tunnel hostname
  │
  ▼
Cloudflare Tunnel
  │ outbound connector
  ▼
cloudflared on the computer
  │ localhost
  ▼
T3 server
  ▼
Coding-agent CLI
```

### Host-side setup

`t3 connect link`:

1. Authenticates the host through Clerk OAuth/PKCE.
2. Links the environment to the user’s T3 Connect account.
3. Requests a managed endpoint.
4. Receives a Cloudflare connector token.
5. Starts a pinned `cloudflared tunnel run` subprocess.
6. Restarts it if it unexpectedly exits.

The host process implementation is [`ManagedEndpointRuntime.ts`](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/apps/server/src/cloud/ManagedEndpointRuntime.ts#L187-L310).

Because `cloudflared` initiates an outbound connection, the computer does not need an open inbound port.

### Mobile connection handshake

When mobile selects a cloud environment:

1. Mobile authenticates with Clerk.
2. It exchanges the Clerk credential for a scoped, proof-key-bound relay token.
3. Mobile asks the relay to connect to an environment and provides its DPoP key thumbprint.
4. The relay verifies the user owns the environment.
5. The relay signs a two-minute connection proof.
6. Through the Cloudflare tunnel, the relay asks the environment to mint a temporary bootstrap credential.
7. The environment verifies the relay signature, linked user, scope, expiry, nonce, and DPoP thumbprint.
8. The environment creates a two-minute, DPoP-bound pairing credential.
9. Mobile exchanges it directly with the environment for an environment access token.
10. Mobile gets a WebSocket ticket and opens the normal Effect RPC WebSocket.

The client relay branch begins in [`ConnectionResolver`](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/packages/client-runtime/src/connection/resolver.ts#L141-L186).

The relay-to-environment credential mint is in [`EnvironmentConnector`](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/infra/relay/src/environments/EnvironmentConnector.ts#L541-L672), with environment-side validation in [`cloud/http.ts`](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/apps/server/src/cloud/http.ts#L948-L1055).

### Important distinction: relay versus data plane

The T3 relay Worker does **not** continuously proxy the chat WebSocket.

It acts as the control plane for:

- Clerk identity
- environment registration
- endpoint allocation
- connection credential brokering
- device registration
- push notifications

Once connected, application traffic flows through the allocated Cloudflare Tunnel hostname directly to the computer. The project explicitly documents this distinction in [remote architecture](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/docs/internals/remote.md#L143-L150).

## Security model

There are deliberately separate credential layers:

| Credential | Purpose | Typical lifetime |
|---|---|---:|
| Pairing credential | Bootstrap a new device | One-time, short-lived |
| Direct bearer token | Reconnect to a directly paired server | 30 days |
| Relay DPoP token | Authorize calls to relay | Short-lived/scoped |
| Environment DPoP token | Relay-connected environment access | 1 hour |
| WebSocket ticket | Authenticate `/ws` upgrade | 5 minutes |
| Cloudflare connector token | Host’s tunnel connection | Host-side secret |

Additional protections include:

- OAuth-style capability scopes
- per-RPC-method authorization
- DPoP proof-of-possession for relay connections
- environment ID validation
- signed relay-to-environment proofs
- signed environment responses
- nonce/JTI replay prevention
- tunnel token redaction from logs
- separate relay and environment issuers/trust boundaries

The durations and token distinctions are documented in [environment authentication](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/docs/internals/environment-auth.md#L60-L105).

## How it is built and shipped

- **CLI/server:** Vite+ `vp pack` produces the `t3` Node bundle.
- **Web:** Vite+ builds the React application.
- **Desktop:** Vite+ bundles Electron main/preload code; Electron Builder creates DMG, NSIS, and AppImage packages.
- **Mobile:** Expo prebuild plus EAS profiles produce iOS and Android development, preview, and production builds.
- **Relay:** Alchemy provisions the Cloudflare Worker, managed tunnel infrastructure, DNS, PlanetScale Postgres, and Hyperdrive.
- **Marketing:** Astro builds the public website.

For local development, the intended flow is:

```bash
curl -fsSL https://vite.plus | bash
vp i
vp run dev
```

Dependencies were not installed and a build was not executed because this was a read-only architecture study.

## Best files to read next

1. [`docs/internals/overview.md`](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/docs/internals/overview.md)
2. [`docs/internals/remote.md`](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/docs/internals/remote.md)
3. [`packages/client-runtime/src/connection/onboarding.ts`](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/packages/client-runtime/src/connection/onboarding.ts)
4. [`packages/client-runtime/src/authorization/service.ts`](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/packages/client-runtime/src/authorization/service.ts)
5. [`apps/server/src/ws.ts`](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/apps/server/src/ws.ts)
6. [`apps/server/src/cloud/http.ts`](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/apps/server/src/cloud/http.ts)
7. [`infra/relay/src/environments/ManagedEndpointProvider.ts`](https://github.com/pingdotgg/t3code/blob/2f486ab80c748b4d8e3d3b17e49b5a327cb93335/infra/relay/src/environments/ManagedEndpointProvider.ts)

---

Session ID: `01a006d0-cebd-726e-a0e6-eb105cf203ce`
