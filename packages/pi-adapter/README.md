# Pi Adapter

Host-side Effect boundary around Pi.

This package owns the Host-facing conversation seam (`ConversationRunner`),
provider credential storage, and Space Zero's own agent-turn value types. Pi SDK
objects, credential file formats, auth secrets, and transcript formats never
escape into Host Contracts or UI.

Current state:

- `conversation.model.ts` — Host-facing agent turn values and the
  `ConversationRunner` port.
- `scripted-conversation.adapter.ts` — deterministic runner for explicit test
  injection only.
- `provider-auth.storage.ts` — focused file-backed implementation of Pi's
  app-owned `CredentialStore` interface for Host-private application data.
- `provider-auth.service.ts` — non-secret provider status plus write-only API-key
  set/remove operations used by the Workspace Host `harness-auth` protocol.
- `pi-conversation.adapter.ts` — Pi SDK-backed runner that creates a Pi Agent per
  turn, wired to a Models runtime with the injected Host-private credential
  store and an auth context that denies ambient environment/file credentials.

Production Workspace Host composition uses the Pi SDK runner and Host-private
credential storage. Missing provider credentials fail closed as
`agent_unavailable`; the Local Host no longer uses provider API keys from process
environment variables and no longer falls back to scripted successful output.

Deferred: OAuth login flows, resource/tool configuration,
cancellation/interruption, restore/cleanup, conversation history persistence
across turns, and a narrow no-paid-call real-Pi compatibility suite.
