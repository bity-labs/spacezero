---
title: Space Zero Workspace Surfaces
---

# Space Zero Workspace Surfaces

## Product Thesis

Space Zero is an **agent-first workspace** for software builders. It is not a
collection of disconnected features, and it should not become a generic Electron
shell with many panels.

The main entry point is the agent. Editor, Git, Terminal, Browser, and
orchestration capabilities exist around the agent workflow so builders can
delegate work, observe progress, inspect results, review changes, and continue or
ship with confidence.

> Cursor is an editor with agents. Space Zero should be an agentic development
> workspace with focused workspace surfaces around the agent.

## Workspace Surface Model

Space Zero is composed of a small number of **workspace surfaces**. Each surface
should be treated like a focused internal product:

- It has one clear job.
- It does not try to do everything.
- It does its job with a high level of polish.
- It composes cleanly with the other surfaces.
- It supports the main Space Zero loop: **delegate agent work → observe → inspect
  → review → continue or ship**.

This model exists to avoid feature sprawl and UI drift. A surface is not good
enough merely because the capability exists; it should feel intentional,
coherent, and excellent at its narrow responsibility.

## Shared Quality Principle

> Every workspace surface exists to reduce ambiguity during agentic development.

A builder should never feel lost about what the agent is doing, what changed,
what failed, what is risky, or what the next useful action is.

When evaluating a feature or UI change, ask:

- Which surface owns this responsibility?
- Does it strengthen that surface's core job?
- Does it compose with the agent work session?
- Does it reduce context switching or ambiguity?
- Is it excellent enough, or merely present?

## Primary Surface: Agent Work Session

The first surface to perfect is the **Agent Work Session**.

This is more than chat. It is the main product experience where a builder
delegates software work to an agent, understands what happened, inspects the
result, and decides what to do next.

### Job

> Let a builder delegate software work to an agent, understand what the agent is
> doing, inspect the result, and continue the loop with confidence.

### It should answer

At any moment, the builder should know:

- What task is the agent working on?
- Is the agent running, blocked, failed, done, or waiting?
- What has the agent done so far?
- What commands or tools did it run?
- What files changed?
- Were tests or checks run?
- What risks or unresolved questions remain?
- What should happen next?

### Quality bar

The Agent Work Session is excellent when:

- Starting an agent task feels obvious and fast.
- Agent state is always clear.
- Messages, tool calls, terminal output, file changes, and results are visually
  distinct.
- The user is never lost after the agent finishes.
- Follow-up is frictionless.
- Review/diff is one click away.
- The session feels like a coherent workflow, not chat plus logs glued together.

### Strong v1 scope

A strong Agent Work Session v1 should support:

1. Start an agent task from the main workspace.
2. See current agent state clearly.
3. See messages, tool calls, commands, and results as distinct UI states.
4. See changed files from the session.
5. Open diff/review from the session.
6. Send a follow-up without losing context.
7. Know if the work is done, failed, blocked, or needs review.

## Supporting Workspace Surfaces

The supporting surfaces should be good, but they should initially become
excellent by serving the Agent Work Session rather than by trying to compete with
standalone specialist tools.

### Agent Surface

Owns:

- Task input
- Agent messages
- Agent state
- Tool activity
- Session timeline
- Follow-up loop
- Result summary
- Next actions

Primary question:

> Can I understand and steer the agent with confidence?

### Diff / Review Surface

Owns:

- Changed files
- Diffs
- Staged/unstaged state
- Review readiness
- Commit, revert, and PR actions later

Primary question:

> Can I confidently understand what changed and decide whether to accept it?

### Terminal Surface

Owns:

- Running commands
- Agent command output
- Logs
- Exit states
- Errors
- Search, copy, and scroll behavior

Primary question:

> Can I understand command execution without being overwhelmed?

### Editor Surface

Owns:

- Inspecting files
- Lightweight edits
- Jumping from agent output or diff to source
- Understanding touched code

Primary question:

> Can I inspect and lightly modify the code related to the agent's work?

Space Zero does not need to beat VS Code as an editor early. The editor should
serve the agent workflow first.

### Browser Surface

Owns:

- App preview
- Manual verification
- Debugging UI behavior
- Future agent/browser interaction

Primary question:

> Can I verify the app behavior connected to the agent's changes?

### Orchestration Surface

Owns:

- Agent and harness management
- Running multiple agents
- Resuming or intervening in work
- Reviewing agent outputs
- Reviewer/fixer flows later

Primary question:

> Can I coordinate agent work safely and clearly?

## Execution Priority

Do not try to perfect every surface at once.

The first product-quality target is **Agent Work Session v1**. The other surfaces
should improve in parallel only where they support that loop.

Once the Agent Work Session feels excellent, use the same quality bar to deepen
Diff / Review, Terminal, Editor, Browser, and Orchestration as focused workspace
surface products.
