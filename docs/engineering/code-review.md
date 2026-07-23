---
title: Code Review
---

## Principle

Review should protect correctness, maintainability, and operational safety while keeping feedback specific, actionable, proportional to risk, and guaranteed to converge under automation.

## Rules

- Review against the stated intent first. Confirm the change solves the requested problem and avoids unrelated work.
- Check observable behavior, edge cases, and failure paths, not only whether the code looks clean.
- Evaluate test quality. Tests should prove behavior through stable interfaces and include regression coverage for bugs.
- Watch for complexity: leaky interfaces, shallow modules, duplicated knowledge, hidden dependencies, and overbroad abstractions.
- Check domain language against `docs/context.md` when business concepts are involved.
- Check ADRs when the change touches an existing architectural decision.
- Load scoped engineering docs when risk requires it: security, production, data, legacy, debugging, or boundaries.
- Prefer concrete comments tied to a line, behavior, or risk. Avoid vague style opinions.
- Distinguish required changes from non-blocking follow-ups. Do not block on personal preference.
- A review status and its prose must agree. `ready-to-merge` cannot coexist with anything described as required before merge.

## Finding Classes

Use two action classes:

- **Required Changes** — a blocker or important improvement that must be addressed before this PR can merge.
- **Follow-ups** — optional improvements, cleanup, speculative hardening, or later work that does not block this PR.

A follow-up must never trigger an unattended fix pass. When useful, create or recommend a separate issue rather than widening the active PR.

## Bounded Automated Review

Automated review has at most three executions for a PR:

1. **Round 1 — full review:** inspect the complete PR against its intent, acceptance criteria, and project doctrine.
2. **Round 2 — verification:** verify prior required findings and inspect the fix delta for regressions.
3. **Round 3 — final verification:** perform focused verification and terminate in merge readiness or human escalation.

Rounds 2 and 3 must not restart an unrestricted review of unchanged code. A new required finding during verification is allowed only when it is:

- an unresolved prior required finding;
- introduced by the latest fix delta; or
- a newly discovered critical security, data-loss, corruption, or correctness defect that makes merging unsafe.

Other newly noticed improvements become non-blocking follow-ups.

There is no automated round 4.

## Review State Machine

```text
needs-review (round 1, full)
  ├─ zero required changes ──────────────────────> ready-to-merge [terminal]
  └─ required changes ───────────────────────────> changes-requested
                                                        │
                                                        └─ required-only fix
                                                               │
                                                               v
                                                  needs-review (round 2, verify)
                                                    ├─ clean ──> ready-to-merge
                                                    └─ required changes
                                                               │
                                                               v
                                                  needs-review (round 3, verify)
                                                    ├─ clean ──> ready-to-merge
                                                    └─ required changes
                                                               │
                                                               v
                                                  human-review-required [terminal]
```

Status meanings are strict:

- `needs-review` — the head changed after a required-only fix and awaits the next bounded review.
- `changes-requested` — rounds 1–2 found one or more required changes.
- `ready-to-merge` — the current head has a completed review with zero required changes.
- `human-review-required` — round 3 still has required changes or review state cannot be resolved safely. Unattended review and fix automation must stop.

Only one review-state label may be active at a time.

## SHA-Aware Review State

Every automated review records machine-readable metadata in its PR comment:

```html
<!-- tstack-review {"head":"<full-head-sha>","round":2,"mode":"verification","status":"ready-to-merge"} -->
```

Automation must use this metadata and labels, not infer state from prose.

Rules:

- The same head SHA cannot receive two automated reviews.
- Review round comes from prior valid metadata, not comment count or guesswork.
- Review feedback is actionable only when its recorded head equals the current PR head.
- Capture the head before review and refetch immediately before and after publication.
- If the head changes during review, do not publish or retain a review marker and do not mutate labels.
- A fixer carries the source review round and reviewed SHA into its summary.
- A `ready-to-merge` head that has not changed is terminal; optional suggestions do not invoke a fixer.
- `human-review-required` is terminal for unattended automation.

## Review Checklist

- Does the change match the issue, PRD, or requested behavior?
- Are important success, edge, and failure paths tested?
- Is the design simpler or at least not more complex than necessary?
- Are naming and domain concepts consistent with project language?
- Are security, data, and production risks considered where relevant?
- Is the change small enough to review confidently?
- In verification mode, were prior required findings and only the fix delta checked?
- Does every required finding meet the blocking threshold for the current round?
- Does the prose agree with the chosen status?
- Does the metadata identify the exact current head, mode, round, and status?
