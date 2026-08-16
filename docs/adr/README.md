# Architecture Decision Records

This directory contains the normative architecture decisions for the active Space Zero `v0.1` line.

## Numbering

New decisions continue from the historical sequence and start at ADR `0025`. Use `0000-template.md` when creating an ADR.

## Active decisions

- [`0025-use-a-separate-workspace-host-with-a-desktop-managed-local-lifecycle.md`](0025-use-a-separate-workspace-host-with-a-desktop-managed-local-lifecycle.md)
- [`0026-use-http-and-authenticated-sse-for-the-workspace-host-protocol.md`](0026-use-http-and-authenticated-sse-for-the-workspace-host-protocol.md)
- [`0027-use-effect-across-the-workspace-host-architecture.md`](0027-use-effect-across-the-workspace-host-architecture.md)
- [`0028-event-source-the-project-session-domain-in-sqlite.md`](0028-event-source-the-project-session-domain-in-sqlite.md)
- [`0029-use-one-conversation-per-managed-worktree-project-session.md`](0029-use-one-conversation-per-managed-worktree-project-session.md)

## Historical decisions

ADRs `0001`–`0024` describe the previous v0 implementation and are preserved under [`archive/v0/`](archive/v0/). They are historical references, not active decisions for v0.1.

A new ADR may retain a useful v0 invariant, but it must state that decision directly rather than treating an archived ADR as normative.
