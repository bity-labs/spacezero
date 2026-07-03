---
title: Domain Modeling
---

## Principle

Use the language of the problem consistently, and model business behavior around real concepts rather than incidental technical structures.

## Rules

- Use terms from `docs/context.md` when naming business concepts, states, actions, and events.
- If a term is ambiguous, clarify it before encoding it in types, tables, APIs, or user-facing behavior.
- Recognize bounded contexts when the same word means different things in different parts of the product.
- Model invariants where they are enforced, not only where data is displayed.
- Use aggregates or consistency boundaries when multiple records must change together to preserve a rule.
- Use domain events only when they represent meaningful business facts, not as generic plumbing.
- Avoid heavy DDD ceremony unless it reduces real confusion or risk.
- Update `docs/context.md` when new durable terminology or distinctions are introduced.

## Checklist

- Are names aligned with the language users, stakeholders, and docs use?
- Does each concept have one clear meaning in this context?
- Are business rules enforced at the correct boundary?
- Are consistency requirements explicit?
- Does `docs/context.md` need to be updated?
