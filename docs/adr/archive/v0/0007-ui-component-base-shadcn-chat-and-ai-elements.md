---
title: Use shadcn Chat Components and AI Elements as the UI Component Base for Agent and Workspace Surfaces
---

## Status

Accepted

## Context

PRD #17 (Pi integration) and the UI prerequisite parent #27 require a large set of agent and workspace UI: Chat Components (#28-#35), the Agent Workspace surfaces (Project Session host #46, Workspace Session host #47), Settings/Models UI (#36-#41), and future IDE surfaces (git diff, file explorer, terminal, preview/debug, test results, debugging).

Space Zero's existing renderer stack is already shadcn-based:

- `components.json` configured with `style: "base-vega"`, `cssVariables: true`, `iconLibrary: "phosphor"`.
- Tailwind v4 with CSS Variables mode.
- `@base-ui/react` as the primitive layer (Base UI).
- Existing `src/renderer/src/components/ui/*` (button, card, command, dialog, input, input-group, textarea).

The UI base must satisfy four constraints:

1. **Stack match.** It must drop into the existing shadcn/Tailwind v4/Base UI/Phosphor setup with minimal friction.
2. **Source ownership.** Space Zero must own the component source so it can swap type imports, icon libraries, and styles without dependency lock-in. This matters for a desktop app that needs to control its UI fully.
3. **No runtime/agent-layer coupling.** ADR 0006 runs Pi in an Electron utility process behind a main-brokered typed-IPC + `MessagePort` boundary. The renderer never talks to Pi directly. A UI library that bundles its own agent runtime, expects direct SSE/HTTP to the agent, or wants to own the agent layer would conflict with that boundary.
4. **Breadth for the full product vision.** Space Zero needs not only chat but future IDE surfaces: file explorer, terminal, git diff/commit, code blocks, web preview, test results, stack traces. A chat-only library would force a second foundation later.

ADR 0006 (Pi integration) and ADR 0005 (Workspace Tools) are the governing architecture decisions.

## Decision

Space Zero uses **two shadcn-compatible registries** as the UI component base for agent and workspace surfaces. Both are copied into the codebase via their CLIs, not installed as npm dependencies.

### 1. shadcn official Chat Components (June 2026)

Used for the **conversation container** — the hard streaming-scroll and message-row behavior.

Components:

- `MessageScroller` — scroll container for conversations. Handles anchored turns, streamed replies, saved thread restore, prepended history, jump-to-message, scroll controls, and visibility tracking. Owns that behavior without owning message content, transport, persistence, or model state.
- `Message` — conversation row layout (avatar, alignment, header, content, footer, grouping).
- `Bubble` — message surface with variants, alignment, reactions, links, buttons, collapsible content.
- `Attachment` — files and images with media, metadata, upload state, actions.
- `Marker` — status updates, system notes, bordered rows, labeled separators (streaming state, tool activity, date breaks).
- `@shadcn/react` — headless package containing the unstyled scroll behavior (`message-scroller`) tested once and shared across Radix and Base UI.
- CSS utilities `scroll-fade` and `shimmer` (ship with `shadcn/tailwind.css`).

Install via the shadcn CLI. These are native to Space Zero's existing shadcn setup.

### 2. AI Elements (`vercel/ai-elements`)

Used for the **AI-specific and IDE-specific components** that shadcn core does not cover.

Chat/AI components installed for v0 Chat Components:

- `prompt-input` — chat input (A2).
- `tool` — tool-call rendering block with collapsible disclosure, args, streaming output, result, error state (A6).
- `confirmation` — inline tool-use approval card tied to a tool call id (A7).
- `model-selector` — model picker (A4, and basis for A5 thinking selector).
- `reasoning` — thinking/reasoning blocks (A1 thinking parts).
- `task` — task/plan display.

Future IDE components installed as those surfaces are built:

- `code-block`, `file-tree`, `terminal`, `commit`, `web-preview`, `test-results`, `stack-trace`, `snippet`, `artifact`, `schema-display`.

Install via `npx ai-elements@latest add <component>`. AI Elements is a shadcn registry built on Tailwind v4 CSS Variables and shadcn primitives, matching Space Zero's setup.

### What is NOT used as a dependency

- **assistant-ui (`@assistant-ui/react-ui`, `@assistant-ui/react-pi`).** Not installed. assistant-ui is a mature, production-grade chat library, and its `@assistant-ui/react-pi` package is a dedicated Pi adapter. However, its runtime adapter expects to talk to Pi via HTTP/SSE or a colocated node client — not through main as a broker per ADR 0006. Installing it would create abstraction friction with the brokered-IPC model and introduce an npm dependency instead of copied source. **Its `react-pi` runtime source is used as a reference pattern only** (see the reference issue linked below) for how to project Pi events into UI state.
- **CopilotKit.** Not installed. It is a full agent framework (AG-UI protocol, own runtime, own backend) that wants to be the agent layer. This directly conflicts with ADR 0006: Pi is the agent harness.
- **21st.dev agent-elements.** Not installed as a dependency. It is a newer, smaller (78 stars at time of writing), SDK-coupled shadcn registry with excellent coding-agent tool cards (`BashTool`, `EditTool` with diffs + approval, `ToolApprovalFooter`, `QuestionTool`). Its source is used as a **pattern reference** for building Pi project-tool cards and the Workspace Tool confirmation card, not as a foundation.

### Adaptation work (required for both registries)

Because components are copied source, Space Zero adapts them:

- **Type imports.** AI Elements components import types from the Vercel AI SDK (e.g. `import type { ToolUIPart } from "ai"`). Replace these with Space Zero's own agent event/message types defined in `src/shared`, mapped from Pi's event model.
- **Icons.** Components use `lucide-react`; swap to Phosphor (`@phosphor-icons/react`) per the existing `components.json` `iconLibrary`.
- **Event-to-state projection.** Write a `useAgentSession(sessionId)` hook in the renderer that subscribes to `window.spacezero.agent.*` IPC events and produces state for the components. Use `@assistant-ui/react-pi`'s `threadState.ts`, `messageProjection.ts`, `ThreadController.ts`, and `hostUi.ts` as reference patterns for projecting Pi events to UI state and handling host-UI (approval) requests. Implement Space Zero's own reducer; do not depend on the assistant-ui package.

### Mapping to Chat Components (#28-#35)

| Chat Component issue | Source |
|---|---|
| #28 A1 Chat message | shadcn `Message` + `Bubble`; AI Elements `message`/`reasoning` for thinking blocks |
| #29 A2 Chat input | AI Elements `prompt-input` |
| #30 A3 Streaming text | shadcn `MessageScroller` (anchored streaming) + `shimmer` utility |
| #31 A4 Per-session model selector | AI Elements `model-selector` |
| #32 A5 Per-session thinking selector | AI Elements `model-selector` (adapted) or shadcn `Command` |
| #33 A6 Tool-call rendering block | AI Elements `tool` |
| #34 A7 Inline confirmation card | AI Elements `confirmation` |
| #35 A8 Running/idle indicator | shadcn `Marker` + `shimmer` utility |

## Rationale

**Two registries instead of one.** shadcn's official chat components (June 2026) are newer and reimagined for the conversation container: `MessageScroller` owns anchored streaming, saved-thread restore, prepend history, and jump-to-message as a headless, tested primitive. AI Elements predates these and its `conversation`/`message` components are less sophisticated for the scroll/streaming behavior. But AI Elements covers the AI-specific and IDE-specific surface that shadcn core does not: `tool`, `confirmation`, `model-selector`, `reasoning`, `task`, `prompt-input`, and the future `file-tree`/`terminal`/`commit`/`web-preview`/`test-results`/`stack-trace`. Using both gives Space Zero the best conversation container and the broadest AI/IDE coverage. shadcn itself states the two compose: "This does not replace AI Elements."

**shadcn registry model (copied source) over npm packages.** Copied source gives full ownership: Space Zero can swap type imports, icons, and styles; customize every pixel; and is not locked to an upstream release cadence. This is critical for a desktop app that must own its UI. assistant-ui and CopilotKit are npm dependencies with their own runtimes and abstractions.

**No runtime coupling (ADR 0006 compatibility).** Both chosen registries are presentational: components accept props and emit callbacks; they do not bundle an agent runtime, transport, or backend. The renderer feeds them state produced by `window.spacezero.agent.*` IPC events brokered through main. assistant-ui's `react-pi` and CopilotKit both couple to their own runtime/transport and would fight the brokered-IPC boundary.

**Reference over dependency for coding-agent tool cards.** 21st.dev agent-elements has excellent `BashTool`/`EditTool`/`ToolApprovalFooter` patterns that map directly to Pi's project tools and the Workspace Tool confirmation (A7). But it is too new, too small, and tied to the 21st.dev Agent SDK + Vercel AI SDK to be a foundation. Using it as a pattern reference captures the value without the risk.

**Reference over dependency for the Pi event projection.** `@assistant-ui/react-pi` is the only existing example of projecting Pi agent events into a chat UI state model. Its `threadState.ts` (snapshot-authoritative reducer), `messageProjection.ts` (Pi transcript → UI messages), `ThreadController.ts` (event bridging), and `hostUi.ts` (approval/request handling) are exactly the patterns Space Zero's `useAgentSession` hook must implement. Referencing them avoids reinventing the projection and avoids the runtime-adapter friction.

## Consequences

- Space Zero pulls components from two shadcn registries into `src/renderer/src/components`. Chat container primitives come from shadcn core; AI/IDE components come from AI Elements.
- Each copied component must be adapted: AI SDK type imports replaced with Space Zero types, lucide icons swapped for Phosphor.
- Space Zero implements its own Pi event → UI state projection in the renderer (`useAgentSession` hook + reducer), guided by the `@assistant-ui/react-pi` reference patterns tracked in the reference issue.
- Future IDE surfaces (file explorer, terminal, git diff, preview, test results, debugging) pull from AI Elements' code/workflow component set as those features are built.
- The UI base does not constrain the agent architecture: Pi still runs in the utility process behind the brokered IPC boundary per ADR 0006.
- Dependency footprint stays minimal: only `@shadcn/react` (headless scroll behavior) is a real npm dependency; everything else is copied source. (AI Elements may pull a small set of npm deps for specific components; review per component at install time.)
- Follow-up work tracked in the reference issue: build the `useAgentSession` reducer against the `react-pi` patterns; install and adapt the v0 Chat Component set; define the Space Zero agent event/message types in `src/shared` that replace the AI SDK type imports.

## Alternatives Considered

- **AI Elements only.** Rejected as the sole foundation because shadcn's June 2026 chat components provide a better, headless-tested conversation container (`MessageScroller`) that AI Elements predates. AI Elements remains the source for AI/IDE components. The two compose by shadcn's own statement.
- **assistant-ui (`@assistant-ui/react-ui` + `@assistant-ui/react-pi`).** Rejected as a dependency because its runtime adapter expects direct HTTP/SSE or colocated-node access to Pi, which conflicts with ADR 0006's brokered-IPC boundary. It is npm, not copied source. Its `react-pi` source is used as a reference pattern only.
- **CopilotKit.** Rejected because it is a full agent framework that wants to own the agent layer, conflicting with ADR 0006 (Pi is the harness). Not shadcn-based. Multi-platform scope (Slack, Teams, React Native) is unnecessary for an Electron desktop app.
- **21st.dev agent-elements as a foundation.** Rejected because it is too new (78 stars), too small in component breadth (chat-only, no IDE surfaces), and coupled to the 21st.dev Agent SDK + Vercel AI SDK. Its coding-agent tool-card source is used as a pattern reference only.
- **Build all components from scratch on shadcn primitives.** Rejected because it would reinvent streaming-anchored scroll, tool-call disclosure, confirmation cards, and the entire IDE component set that AI Elements already provides. The adaptation work (type/icon swaps) is far smaller than building from zero.

## Review Trigger

Revisit this decision if:

- shadcn core ships AI-specific components (tool, confirmation, model-selector, reasoning) that subsume the AI Elements set, making a single registry sufficient.
- AI Elements is deprioritized or abandoned by Vercel. Because components are copied source, Space Zero is not stranded, but a successor registry would be evaluated.
- The `@assistant-ui/react-pi` adapter matures into a transport-agnostic, broker-friendly form that removes the ADR 0006 friction, making assistant-ui viable as a dependency.
- Space Zero needs IDE components (file-tree, terminal, commit, web-preview) that AI Elements does not cover well, and a different registry becomes the better source for those.
- The adaptation cost (AI SDK type swaps, icon swaps) proves larger than expected and a presentational-only library becomes attractive.

## References

- ADR 0006: Pi agent harness in a utility process via the SDK
- ADR 0005: Workspace Tools as the agent application control plane
- PRD #17: Pi integration
- UI prerequisites parent #27
- Pi event → UI state projection reference issue: #48
