# ADR 0035: Restart the Local Host but never replay ambiguous work

## Status

Accepted

## Context

The Local Host is a separate private-Node process. Process crashes, native-module failures, resource exhaustion, and unexpected termination must not destroy durable Session history or managed worktrees. Desktop can supervise and restart the process while it remains open.

Event sourcing identifies the last durable Session facts, but it cannot prove whether an external provider, tool, filesystem, or Git side effect occurred between the last durable boundary and a crash. Automatically replaying ambiguous work can duplicate edits, commands, commits, API calls, or model turns.

## Decision

While Desktop is running and has not entered explicit shutdown, it supervises the Local Host and restarts an unexpected exit using bounded exponential backoff.

Each restart:

- launches a fresh private-Node Host process;
- establishes a fresh Host instance identity;
- repeats the protected bootstrap flow;
- invalidates all previous supervisor and client capabilities;
- opens and migrates the Host database safely;
- reconciles incomplete event-sourced lifecycle state; and
- authenticates managed Project Session worktrees before exposing or resuming them.

Desktop stops automatic retries after a bounded failure threshold and presents Host recovery diagnostics and an explicit retry action. Exact backoff timings and retry limits are operational configuration covered by tests rather than durable product semantics.

Explicit Desktop quit disables crash restart and follows the orderly Local Host shutdown behavior in ADR 0025.

### Session recovery

Completed and idle Project Sessions may be restored after worktree authentication and Pi reconciliation.

A command or prompt that is durably admitted and proven not to have begun external execution may be scheduled safely after recovery according to its recorded delivery semantics.

A turn, tool, Git operation, or other side effect that may have started before the crash is never automatically replayed merely because its success event is absent. The Host records an explicit interrupted, unknown, or recovery-required outcome and presents it to the builder.

The builder may then inspect current workspace state and explicitly continue, retry, or abandon the work through a designed command. Recovery code must not invent successful outcomes or silently rerun ambiguous side effects.

Pi transcripts are reconciliation input, not automatic proof that every Space Zero domain operation completed. Filesystem and Git state may also be inspected through narrow recovery adapters where a concrete operation has a deterministic verification rule.

## Rationale

Automatic process restart improves availability without weakening the fail-closed behavior required for agent and workspace side effects. Fresh authentication prevents a restarted process from inheriting stale capabilities, while durable events and worktree identity preserve coherent recovery context.

Requiring proof before replay is safer than treating event absence as operation failure. The cost of explicit builder continuation is preferable to duplicated or contradictory repository mutations.

## Consequences

- Desktop needs a Host supervisor with restart backoff, failure threshold, diagnostics, and explicit shutdown state.
- Session events and projections need interrupted/unknown/recovery-required states.
- Commands that may be retried automatically must have a durable admission boundary and deterministic proof that execution did not start.
- Worktree, Pi, filesystem, and Git reconciliation require focused tests around crash boundaries.
- Client Runtime must discard old capabilities and projections as appropriate when Host instance identity changes.
- Host restart does not imply automatic continuation of an active model turn.

## Alternatives Considered

- **Do not restart the Local Host automatically** — rejected because a transient Host crash should not require restarting Desktop or strand all idle Sessions.
- **Automatically rerun every incomplete command** — rejected because external side effects may already have occurred.
- **Assume absence of a success event proves failure** — rejected because the Host may crash after the side effect but before recording its outcome.
- **Persist and reuse old capabilities after restart** — rejected because a fresh Host instance requires a fresh authorization boundary.

## Review Trigger

Revisit this decision if:

- Pi provides a durable execution identity that can prove safe continuation;
- specific tools or Git operations gain deterministic idempotency and reconciliation contracts;
- Remote Host infrastructure provides stronger process/execution fencing; or
- measured restart behavior requires different supervision or failure-threshold policy.
