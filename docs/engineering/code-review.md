---
title: Code Review
---

## Principle

Review should protect correctness, maintainability, and operational safety while keeping feedback specific, actionable, proportional to risk, and able to converge autonomously.

## Finding Classes

Use two action classes:

- **Required Changes** — objectively verifiable defects that make the current PR unsafe to merge because they violate acceptance criteria, correctness, security, data integrity, required architecture, or required validation.
- **Follow-ups** — optional improvements, cleanup, preferences, or later work that does not make the PR unsafe to merge.

Each required finding gets a stable ID when first reported: `R<origin-round>-F<sequence>`, for example `R1-F1`. Verification reviews reuse the same ID while the finding remains open or if it regresses. A required finding must state the violated behavior or invariant, impact, required outcome, and objective verification evidence. Subjective concerns belong in follow-ups and never invoke the fixer.

## Autonomous Review Loop

Automated review has no fixed round limit:

1. **Round 1 — full review:** inspect the complete PR against intent, acceptance criteria, and project doctrine.
2. **Rounds 2 and later — verification:** verify open finding IDs and inspect only the latest fix delta for regressions.
3. Continue review and fix passes until the current head has zero open required findings and becomes `ready-to-merge`.

Verification must not restart a broad review of unchanged code. It may add a new required finding only when the latest fix introduced it or objective evidence encountered during focused verification proves a critical merge-unsafe defect. Other newly noticed improvements become follow-ups.

### No-Progress Guardrails

Compute a stable fingerprint of the cumulative PR patch:

```bash
git diff --no-ext-diff --binary <merge-base>...<head> | git patch-id --stable
```

Use the first output field as `patch`. A review records `patch` and the sorted open finding IDs.

The same `(patch, open finding IDs)` state must not trigger another broad review or the same repair approach. Reuse the existing finding contracts and escalate the fixer:

1. first fix attempt for a finding → `targeted`;
2. finding still open at its second reviewed occurrence → `root-cause` with focused regression evidence, preferably test-first;
3. finding still open afterward → `reimplementation` of the affected behavior from the issue and acceptance criteria.

Further reimplementation attempts are allowed only with a new cumulative patch fingerprint. The fixer must never push a patch fingerprint already reviewed with any still-open target finding. Previously passing validation must remain passing; fixes may not weaken tests or contracts to manufacture progress.

## Review State Machine

```text
needs-review
  ├─ zero open findings ─────────────────────────> ready-to-merge [terminal for unchanged head]
  └─ one or more open findings ──────────────────> changes-requested
                                                        │
                                                        └─ required-only novel validated fix
                                                               │
                                                               v
                                                          needs-review
```

Only these review-state labels are active:

- `needs-review` — the current head has not completed review.
- `changes-requested` — the current head has one or more open required findings.
- `ready-to-merge` — the unchanged current head has zero open required findings and required validation passed.

Only one may be active. `human-review-required` is legacy input only: remove the label during reconciliation and treat a valid legacy review with concrete required findings as `changes-requested`. Never emit that status again.

## Review Metadata

Every new review ends with exactly one marker as its final non-empty line:

```html
<!-- tstack-review {"head":"<full-head-sha>","round":4,"mode":"verification","status":"changes-requested","patch":"<patch-id>","open":["R1-F1"]} -->
```

Rules:

- `head` is the reviewed full lowercase SHA.
- `round` is a positive integer with no maximum.
- `mode` is `full` only for round 1 and `verification` afterward.
- `status` is `changes-requested` or `ready-to-merge`.
- `patch` is the stable cumulative patch fingerprint.
- `open` is a sorted unique array of stable finding IDs.
- `changes-requested` requires a non-empty `open`; `ready-to-merge` requires an empty `open` and passing required validation.

Versionless legacy markers with only `head`, `round`, `mode`, and `status` remain valid historical input when coherent. Legacy `human-review-required` maps to `changes-requested`; its concrete required items receive IDs on their next fix or verification pass. Legacy round 3 does not cap future rounds.

## History and Recovery

- Trust a marker only from the configured reviewer identity, as the comment's only marker and final non-empty line. Ignore untrusted or malformed marker-like text.
- Valid review markers form one chronological sequence: round 1/full, then rounds increment by one on distinct head SHAs in verification mode.
- Never review the same head twice. A trusted same-head marker determines its exact label; reconcile labels instead of publishing again.
- Review feedback is actionable only when its marker head equals the current PR head.
- A newer unreviewed head with a stale result label returns to exactly `needs-review`.
- For non-exclusive labels, use a valid same-head marker as the target; otherwise recover to exactly `needs-review`.
- Check the head immediately before and after review publication, push, and every label transition. Remove or neutralize stale state-bearing comments.
- Operational failures must never invent `ready-to-merge`. Preserve or recover a safe `needs-review` state and report the failed precondition so the controller can retry.

## Review Checklist

- Does the change match the issue, PRD, or requested behavior?
- Are important success, edge, and failure paths tested?
- Is each required finding objectively merge-unsafe and verifiable?
- Are prior open finding IDs explicitly resolved or retained?
- Did verification inspect only prior findings and the latest fix delta?
- Is the cumulative patch novel for persistent findings?
- Did previously passing validation remain intact?
- Are naming, domain concepts, architecture, security, and data handling consistent with project doctrine?
- Do prose, status, metadata, head SHA, patch, and open IDs agree?
