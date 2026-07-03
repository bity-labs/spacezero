---
name: clarify-with-context
description: Clarify an idea, feature, or plan using the project's context, domain language, ADRs, and code. Use before writing a PRD when shared understanding depends on existing project meaning or decisions.
---

# Clarify With Context

Clarify the idea, feature, or plan until we share the same understanding of what it means in this project.

Use the project context while questioning:

- `docs/context.md`
- `docs/adr/`
- `docs/adr/0000-template.md` when creating an ADR
- relevant code when the answer can be discovered from the repository

Ask one question at a time.

For each question, provide your recommended answer or default position.

Walk down the decision tree one branch at a time. Resolve dependencies between decisions before moving on.

## Sharpen Language

Use the project's existing domain language.

When the user uses a fuzzy, overloaded, or conflicting term, stop and clarify it.

If `docs/context.md` defines a term differently from the user's usage, call out the conflict directly.

Do not let vague language pass into the PRD.

## Check Against Reality

When the user describes current behavior, compare it against the existing docs and code.

If the docs, code, and user explanation disagree, surface the mismatch.

Do not assume which source is right. Ask the user to resolve it.

## Update Context

When a domain term, distinction, rule, external system, or reference is resolved, update `docs/context.md` using its existing sections.

Do not wait until the end if the meaning is clear now.

Keep context documentation focused on durable product and domain meaning, not temporary plans or low-level implementation details.

## ADRs

Offer an ADR only when the decision is worth preserving.

An ADR is appropriate when the decision is:

- hard to reverse
- surprising without context
- based on a real tradeoff

If the decision is obvious, temporary, or easy to change, do not create an ADR.

When creating an ADR, use `docs/adr/0000-template.md` and save it under `docs/adr/` with the next sequential number and a kebab-case title.

## Stop Condition

Stop when the idea is clear enough to create a PRD and no blocking questions remain.

End with:

- shared understanding summary
- clarified terms
- resolved decisions
- docs updated
- ADRs created or proposed
- recommended next step

If a blocking question remains, do not present the work as PRD-ready. State the question that must be answered first.
