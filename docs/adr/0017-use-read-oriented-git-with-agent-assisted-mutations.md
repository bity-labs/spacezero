---
title: Use a read-oriented Git Tool with agent-assisted mutations
---

## Status

Accepted

## Supersession Note

ADR 0022 replaces the Git Tool container with the singleton Git Diff Side Pane Tab. ADR 0023 supersedes the view-only diff-content rule by allowing edits to the shared unsaved document buffer. Direct Git mutations remain agent-assisted as decided here.

## Context

Project Sessions and the Knowledge Base need Git review beside chat. A traditional embedded Git client would require Space Zero to own staging selection, discard/reset safety, commit forms, remote management, divergence handling, pull/rebase/push orchestration, and conflict workflows in renderer UI.

Space Zero already has an active agent in each relevant context. Project Session agents can use Pi's project tools in their authenticated managed worktrees. Knowledge Base Chat is backed by a managed Workspace Session and can receive narrowly scoped, main-backed Git Workspace Tools.

The existing Knowledge Base sync flow stages every change, generates a commit, pulls with rebase, and pushes automatically. That background mutation model conflicts with a review-first Tool Pane and can change repository state without an explicit builder request.

Relevant product work is described by #168 and implementation issues #169–#177. This decision builds on ADR 0002, ADR 0005, ADR 0006, and ADR 0013.

## Decision

The shared Git Tool is read-oriented and routes repository mutations through the active agent Session.

- Main resolves the authenticated Project Session worktree or verified Knowledge Base repository and exposes typed status/diff queries to renderer Git UI.
- Git UI shows saved repository state, branch/upstream information, staged/unstaged/uncommitted diffs, and conflicts. It does not directly stage, unstage, discard, reset, commit, fetch, pull, rebase, push, or configure remotes.
- Commit, Commit & Push, Commit and create a PR, and Resolve with agent actions send normal transcript-visible prompts through the active Session's existing prompt path. Commit and create a PR extends the same commit-and-push agent flow with authenticated GitHub tooling available to the Session, deterministic reuse of an existing open pull request when possible, explicit partial-failure reporting, and a usable pull request URL in the final response. These actions do not create a second hidden Git workflow or prompt queue, and Space Zero's main-owned GitHub credential is not exposed to renderer or project command environments.
- Project Session agents perform requested Git work with their existing project capabilities in the managed worktree.
- The managed Knowledge Base Chat Session receives approved main-backed Git Workspace Tools through the existing Workspace Tool Registry, safety policy, and Agent Activity History.
- Ordinary Workspace Sessions expose no Git Tool because they have no required repository identity.
- Files owns editing and explicit save. Git reads saved repository state only and never auto-saves Files buffers.
- Knowledge Base automatic add/commit/pull-rebase/push scheduling is removed as shared Git review and managed-agent capabilities replace it. Background refresh may query Git but must not mutate the repository.

## Rationale

The agent already has repository context and can inspect fresh state, explain decisions, handle repository-specific failures, and keep its work visible in the conversation. Reusing that workflow keeps the initial Git Tool focused on its differentiating value: fast, trustworthy visual review beside chat.

A direct mutation-heavy Git UI would duplicate behavior across renderer controls, Project Session tools, and Knowledge Base services. It would also require a large safety and recovery surface before Space Zero has validated that builders want a full embedded Git client.

Removing automatic Knowledge Base mutation makes repository changes explicit. Builders can still request the same outcomes, but the request and result remain visible in the managed chat and pass through existing safety boundaries.

## Consequences

- Git actions require an idle active agent Session and are unavailable when no appropriate Session exists.
- The agent may ask follow-up questions or report partial outcomes, such as committing locally when no remote is configured.
- The Git Tool must refresh after agent runs and external repository changes rather than assuming a deterministic built-in commit state machine.
- Knowledge Base needs scoped Git Workspace Tools in main; those tools must not become an arbitrary Git-command API.
- The old Knowledge Base sync scheduler, mutation pipeline, sync state, IPC, and renderer controls become cleanup candidates tracked by #133.
- Builders who want direct hunk staging or a traditional Git client will not receive it in v0.
- Agent prompts must instruct fresh inspection rather than embedding potentially stale rendered diff payloads.

## Alternatives Considered

- Full direct Git client in the Tool Pane — rejected for v0 because it creates a large mutation, safety, recovery, and conflict UI that duplicates the active agent's capabilities.
- Keep automatic Knowledge Base sync — rejected because it mutates repository state in the background and does not match explicit agent-first workflows.
- Make Git entirely conversational with no visual tool — rejected because builders need fast diff review and repository status without asking the agent to narrate every change.
- Expose arbitrary Git commands as Workspace Tools — rejected because it weakens validation and makes safety policy difficult to reason about.

## Review Trigger

Revisit if builders consistently need direct staging/hunk control, agent-assisted Git is too slow or unpredictable, Knowledge Base workflows require deterministic unattended synchronization, or a mature shared Git service makes safe direct mutations substantially simpler.
