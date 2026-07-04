---
title: Code Review
---

## Principle

Review should protect correctness, maintainability, and operational safety while keeping feedback specific, actionable, and proportional to risk.

## Rules

- Review against the stated intent first. Confirm the change solves the requested problem and avoids unrelated work.
- Check observable behavior, edge cases, and failure paths, not only whether the code looks clean.
- Evaluate test quality. Tests should prove behavior through stable interfaces and include regression coverage for bugs.
- Watch for complexity: leaky interfaces, shallow modules, duplicated knowledge, hidden dependencies, and overbroad abstractions.
- Check domain language against `docs/context.md` when business concepts are involved.
- Check ADRs when the change touches an existing architectural decision.
- Load scoped engineering docs when risk requires it: security, production, data, legacy, debugging, or boundaries.
- Prefer concrete comments tied to a line, behavior, or risk. Avoid vague style opinions.
- Distinguish blockers from suggestions. Do not block on personal preference.

## Review Checklist

- Does the change match the issue, PRD, or requested behavior?
- Are important success, edge, and failure paths tested?
- Is the design simpler or at least not more complex than necessary?
- Are naming and domain concepts consistent with project language?
- Are security, data, and production risks considered where relevant?
- Is the change small enough to review confidently?
