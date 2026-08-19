# Pi Adapter

Host-side Effect boundary around Pi.

This package owns the Host-facing conversation seam (`ConversationRunner`) and
Space Zero's own agent-turn value types. Pi SDK types, auth file formats, and
transcript formats never escape into Host Contracts or UI.

Current state:

- `conversation.model.ts` — Host-facing agent turn values and the
  `ConversationRunner` port.
- `scripted-conversation.adapter.ts` — deterministic runner used by Host tests
  and the initial Local Host until the authenticated Pi SDK runner lands.
- The Pi SDK dependency remains deferred by workspace boundary policy; the
  scripted runner keeps prompt flows testable without paid provider calls.

Deferred: real Pi SDK runner, Host-global Pi authentication storage access,
resource/tool configuration, cancellation/interruption, restore/cleanup, and a
narrow no-paid-call real-Pi compatibility suite.
