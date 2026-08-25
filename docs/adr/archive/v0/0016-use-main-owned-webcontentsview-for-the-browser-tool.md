---
title: Use main-owned WebContentsView surfaces and a dedicated profile for the Browser Tool
---

## Status

Accepted

## Supersession Note

ADR 0022 supersedes this ADR's Tool Pane and internal Browser-tab layout assumptions. Its main-owned `WebContentsView`, dedicated profile, security boundary, and page lifecycle decisions remain accepted; each browser page is now represented by one Side Pane Tab.

## Context

Space Zero needs one shared Browser Tool in Project Sessions, Workspace Sessions, and the Knowledge Base. Browser pages include arbitrary remote content, localhost project previews, authentication flows, downloads, and permission requests. That content is untrusted and must not share the privileged Space Zero renderer, its preload API, or its Electron session.

The Browser must keep pages live while its renderer component is unmounted, isolate tab collections by Tool Pane context, persist authenticated site sessions, and fit a resizable region inside the existing app window. BrowserView is deprecated, `<webview>` would put too much lifecycle authority in renderer markup, and iframes cannot provide the required navigation, profile, permission, download, popup, and certificate controls.

Relevant product work is described by #139 and its implementation issues, beginning with #141. This decision builds on ADR 0002's secure Electron boundaries, ADR 0003's main-owned product state, and ADR 0008's renderer-owned layout state.

## Decision

The Browser Tool uses main-owned Electron `WebContentsView` instances attached to the app window's content view.

- Main creates, owns, attaches, positions, hides, detaches, and destroys every Browser tab's `WebContentsView` and `webContents`.
- Renderer Browser chrome uses opaque tab/content ids and narrow typed preload/IPC operations. It cannot select arbitrary Electron sessions, partitions, windows, views, or web contents.
- Browser pages use sandboxed web preferences with no Node.js integration and no Space Zero preload. They never receive `window.spacezero` or direct access to the privileged app renderer.
- All Browser tabs share one dedicated persistent Electron session partition for cookies, site storage, cache, and authenticated site sessions. The partition is separate from the privileged app renderer and the user's system browser profile.
- Tab collections and restoration metadata remain isolated by Tool Pane context even though the web profile is shared.
- Main owns navigation policy, popup/auth-child-window policy, permission decisions, certificate handling, downloads, external-protocol handoff, profile clearing, and web-content cleanup.
- Tool Pane and Browser renderer state provide validated bounds, visibility, and focus requests; main remains authoritative for native view lifecycle and context ownership.
- Live views may remain detached or hidden while another tool/context is active. Persisted tab metadata stores URLs and tab identity only, never live web contents or full navigation stacks.

## Rationale

`WebContentsView` is Electron's supported main-owned composition primitive for embedding independently sandboxed web content in an existing window. It keeps native web-content authority out of the renderer while allowing Space Zero to place Browser pages inside the Tool Pane.

A dedicated persistent partition gives builders durable site authentication without exposing or importing their system-browser profile. Sharing that profile across Space Zero Browser tabs matches normal browser expectations, while context-keyed tab metadata prevents Project Session, Workspace Session, and Knowledge Base working sets from leaking into one another.

Main ownership centralizes security-sensitive policy. Renderer code can present Browser chrome without becoming responsible for permissions, downloads, external protocols, popup windows, certificates, or native resource identity.

## Consequences

- Main needs a Browser view registry keyed by opaque ids and authenticated Tool Pane context ownership.
- Tool Pane bounds and visibility changes require explicit typed IPC and careful synchronization with the native view.
- Browser views can outlive renderer components during an app run, so cleanup on tab close, context deletion, window close, and app shutdown must be explicit.
- Tests need main policy seams plus minimal Electron integration coverage; jsdom alone cannot prove native view placement or sandbox isolation.
- The persistent profile may contain sensitive browsing state. Normal logs and Agent Activity History must not record cookies, headers, page bodies, or full sensitive URLs.
- Authentication popups that require `window.opener` must be controlled main-owned child windows using the same sandbox and dedicated profile.
- Browser pages cannot use ordinary React DOM composition inside the Tool Pane; native view bounds must track the renderer-defined pane region.

## Alternatives Considered

- Electron `<webview>` — rejected because it places guest lifecycle in renderer markup, has a broader and historically risky API surface, and weakens auditability of native resource ownership.
- `BrowserView` — rejected because Electron has deprecated it in favor of `WebContentsView`.
- iframe-based browsing — rejected because framing restrictions and limited control over profiles, permissions, downloads, certificates, and popups cannot satisfy the Browser contract.
- Load pages in the privileged Space Zero renderer — rejected because untrusted web content would share authority with application UI and violate ADR 0002.
- Open every URL in the system browser — rejected because it does not deliver the integrated Browser/preview workflow.

## Review Trigger

Revisit if Electron replaces `WebContentsView`, native-view bounds prove unreliable for the Tool Pane, persistent profile isolation is insufficient, packaging/platform behavior diverges materially, or future controlled page inspection requires a different process model.
