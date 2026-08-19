# Pi Adapter

Host-side Effect boundary around Pi.

This package owns the Host-facing conversation seam (`ConversationRunner`) and
Space Zero's own agent-turn value types. Pi SDK types, auth file formats, and
transcript formats never escape into Host Contracts or UI.

Current state:

- `conversation.model.ts` — Host-facing agent turn values and the
  `ConversationRunner` port.
- `scripted-conversation.adapter.ts` — deterministic runner used by Host tests
  and the Local Host when no Pi API key is configured.
- `pi-conversation.adapter.ts` — Pi SDK-backed runner that creates a Pi Agent
  per turn, wired to a Models runtime with provider-scoped API key auth.
  Streaming text deltas are forwarded to the `onDelta` callback; the final
  assistant text is returned.

Configuration (workspace-host env vars):

- `SPACEZERO_PI_API_KEY` — API key for the configured provider. When set, the
  workspace-host uses the Pi SDK runner; otherwise it falls back to the
  scripted runner.
- `SPACEZERO_PI_PROVIDER` — Provider id, e.g. `"anthropic"`. Defaults to
  `"anthropic"`.
- `SPACEZERO_PI_MODEL` — Model id within the provider, e.g.
  `"claude-sonnet-4-20250514"`. Defaults to `"claude-sonnet-4-20250514"`.

Deferred: Host-global Pi authentication storage access (currently uses an
in-memory credential store pre-populated from env vars), resource/tool
configuration, cancellation/interruption, restore/cleanup, conversation history
persistence across turns, and a narrow no-paid-call real-Pi compatibility suite.
