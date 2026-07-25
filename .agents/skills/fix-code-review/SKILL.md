---
name: fix-code-review
description: Address required GitHub PR review findings when explicitly requested and the current head is in changes-requested, or reconcile a non-exclusive or legacy review state. Do not invoke for ready-to-merge, PR analysis, or when a PR URL is merely mentioned.
---

# Fix Code Review

Address all open required findings from the current trusted review with one novel, validated fix pass. Push the fix, move the new head to `needs-review`, and let an independent reviewer continue until the PR reaches `ready-to-merge`.

## Read These First

1. `docs/engineering/code-review.md`
2. `docs/coding-standards.md`
3. `docs/context.md`
4. Relevant `docs/adr/` and scoped engineering rules
5. `docs/engineering/testing.md`, `docs/engineering/tdd.md`, and `docs/engineering/refactoring.md` when the fix requires them

## Trigger Boundary

Run only when explicitly requested by the user or an unattended controller and the current head has `changes-requested`, including deterministic migration from a valid legacy `human-review-required` state.

Do not edit when the current head is `ready-to-merge` or `needs-review`, when there is no valid current review with concrete required findings, or when the task is analysis/history rather than implementation.

## Protocol

There is no fixed fix-pass limit. Persistent finding IDs change strategy instead of repeating the same edit:

- first reviewed occurrence → `targeted`;
- second reviewed occurrence → `root-cause`, preferably test-first;
- third and later occurrences → `reimplementation` of the affected behavior.

A fix must produce a cumulative patch fingerprint not previously reviewed with any still-open target finding. Optional feedback is never fixed automatically, previously passing validation must remain passing, and only a new independent review may set `ready-to-merge`.

## Workflow

### 1. Snapshot and Reconcile the PR

Fetch:

```bash
gh pr view <PR_URL> --json number,title,body,author,baseRefName,headRefName,headRefOid,isDraft,state,labels,files,reviews,comments
```

Record the full current head SHA. Require an open, non-draft PR.

Use only `needs-review`, `changes-requested`, and `ready-to-merge` as active labels. Detect the legacy `human-review-required` label for removal.

Authenticate the trusted reviewer identity from controller configuration or `gh api user --jq .login`; with fallback identity, require `viewerDidAuthor: true` for state-bearing comments. Trust only strict terminal markers from that identity:

- current schema: `head`, `round`, `mode`, `status`, `patch`, `open`;
- legacy schema: `head`, `round`, `mode`, `status`.

Ignore untrusted or malformed marker-like text.

Reconcile before editing:

1. A trusted same-head marker determines the exact label; map legacy `human-review-required` with concrete required items to `changes-requested`.
2. A same-head `ready-to-merge` marker is terminal; set exactly that label and stop.
3. Any result or legacy human label without a valid same-head marker—including after the head advanced or metadata was malformed—returns to exactly `needs-review`; stop so it can be reviewed.
4. For non-exclusive labels, use a valid same-head marker as the target; otherwise set exactly `needs-review` and stop.
5. Continue only when `changes-requested` is exclusive and a valid same-head review contains concrete required findings.

Every transition removes the other active labels and the legacy human label. Check the head immediately before and after mutation. If recovery fails, make a best-effort transition to exactly `needs-review`; never guess which code to edit.

### 2. Resolve the Current Fix Contract

For a current-schema review, require:

- status `changes-requested`;
- non-empty sorted `open` IDs;
- matching `[R…-F…]` items under **Required Changes**; and
- an invariant, required outcome, and objective verification for every open ID.

For a valid legacy `changes-requested` or `human-review-required` review, extract only concrete required items and assign IDs from their origin round/order, such as `R3-F1`.

Record the review head and round. Ignore optional follow-ups, line comments unrelated to the current required list, stale feedback, and malformed items.

If no concrete required item remains, do not commit or relabel as fixed. Return the PR to `needs-review` so a fresh review can produce a consistent contract.

### 3. Use the Stable PR Worktree

Always work in:

```text
.worktrees/pr-<pr-number>
```

Reuse a clean worktree or create it, then run:

```bash
cd .worktrees/pr-<pr-number>
gh pr checkout <PR_URL>
```

Require `git rev-parse HEAD` to equal the reviewed head and require a clean worktree. Never reset, clean, stash, or discard unexpected work. Stop and report checkout or push-permission failures.

### 4. Select All Open Findings and Their Strategies

In autonomous mode, fix all and only current required-open IDs. Do not ask for a subset and never include optional or follow-up work.

For each ID, count its reviewed open occurrences in trusted history:

- occurrence 1 → `targeted`;
- occurrence 2 → `root-cause`;
- occurrence 3+ → `reimplementation`.

Legacy findings begin at occurrence 1 unless coherent history proves persistence.

Create a plan:

```md
## Fix Plan

Review round: <round>
Reviewed head: <full SHA>

1. [R1-F1] `src/example.ts:42`
   - Invariant: <objective condition>
   - Verification: <focused test, safe command, or deterministic evidence>
   - Strategy: <targeted|root-cause|reimplementation>
   - Plan: <strategy-appropriate change>
```

Do not pause for approval in unattended mode.

### 5. Apply Strategy-Appropriate Fixes

- **Targeted:** make the smallest direct change satisfying the invariant.
- **Root-cause:** reproduce the defect, add focused regression evidence where practical, and repair the underlying cause rather than repeating the surface edit.
- **Reimplementation:** rebuild only the affected behavior from the issue, acceptance criteria, doctrine, and established verification contract while preserving unrelated verified work.

For every strategy:

- keep changes tied to current finding IDs;
- do not expand into unrelated refactoring;
- preserve project vocabulary, architecture, security, and process boundaries;
- do not weaken tests or validation; and
- never apply optional feedback.

If a required finding genuinely needs an unspecified product, security, data, or architecture decision not derivable from project doctrine, stop and report the missing precondition rather than cycling speculative edits.

### 6. Validate

Run:

- each finding's objective verification;
- focused tests for changed behavior;
- previously passing relevant checks; and
- repository-required typecheck, lint, test, build, or end-to-end validation appropriate to risk.

Inspect review-provided commands before execution; they must be trusted, noninteractive, repository-scoped, and non-destructive.

If validation fails, make a strategy-appropriate correction within the same finding IDs and rerun it. Never push while required validation fails or a previously passing check regresses.

### 7. Reject Repeated Code State

Require a substantive local diff. Compute the candidate cumulative PR patch from the merge base, including the working-tree changes:

```bash
git diff --no-ext-diff --binary <merge-base> | git patch-id --stable
```

Use the first field as `candidate_patch`. Compare it with trusted review markers.

If `candidate_patch` equals a prior reviewed patch whose `open` list contains any current target ID, do not commit or push it. Revise using the next strategy. The same commit under a different SHA is not progress.

Review the complete local diff and confirm it contains only required-finding work and preserves previous validation.

### 8. Recheck the Remote Head

Before committing, refetch:

```bash
gh pr view <PR_URL> --json headRefOid
```

Require it to equal the reviewed head. If another actor advanced it, remove only agent-owned uncommitted changes, set exactly `needs-review` for the new head, and stop. Never fix against stale feedback.

### 9. Commit and Push

Stage only audited agent-owned paths or hunks and inspect the staged diff:

```bash
git add -- <audited-paths>
git diff --cached --check
git diff --cached
git commit -m "fix(review): address PR #<pr-number> round <review-round> feedback"
```

Push to the actual writable PR head branch:

```bash
git push origin HEAD:<head-branch>
```

After pushing, require the remote head to equal local `HEAD` and differ from the reviewed head. Record it as `pushed_head`. Never create an empty commit or push broken code.

### 10. Move the New Head to Review

Only after a substantive validated push, keep exactly `needs-review` active and remove `changes-requested`, `ready-to-merge`, and the legacy human label.

Check the head immediately before and after label mutation and require it to equal `pushed_head`. If mutation partially fails on the stable head, retry the exact transition once. If another commit advances the head, `needs-review` remains the safe state for that unreviewed head.

Do not set `ready-to-merge`; the reviewer must verify the fix delta.

### 11. Post the Fix Summary

Post:

```md
## Review Feedback Addressed

Review round: <round>
Reviewed head: `<reviewed-head-sha>`
Pushed head: `<pushed-head-sha>`
Candidate patch: `<patch-id>`
Scope: All open required findings only

Fixed:

- ✅ [R1-F1] `<file:line>` — <what changed>
  - Strategy: `<targeted|root-cause|reimplementation>`
  - Verification: `<command or evidence>` passed

Validation:

- ✅ `<command>` passed

PR status: `needs-review`
```

Print the same summary locally and require the worktree to be clean.

## Guardrails

- Fix only a valid current `changes-requested` contract.
- Address all and only current required-open IDs.
- Never apply optional or follow-up work automatically.
- Never impose a maximum fix pass or review round.
- Never reuse an earlier strategy for a persistent finding.
- Never push a cumulative patch already reviewed with a current target ID open.
- Never regress, remove, or weaken previously passing checks.
- Never fix stale feedback or push broken/empty commits.
- Never discard unexpected work.
- Never let the fixer approve its own changes.
- Always return a pushed head to `needs-review`.
- Remove the legacy human state during reconciliation.
