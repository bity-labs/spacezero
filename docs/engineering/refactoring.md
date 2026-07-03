---
title: Refactoring
---

## Principle

Refactoring improves structure without changing observable behavior, and it is safest when done in small verified steps.

## Rules

- Separate refactoring from feature work. Do not mix behavior changes and cleanup unless the cleanup is required for the change.
- Start with a safety net. Use existing tests, add focused tests, or create characterization coverage before risky edits.
- Keep each step small enough to review and revert independently.
- Preserve behavior. If behavior changes, call it out as a feature or bug fix, not a refactor.
- Run relevant validation after meaningful steps, not only at the end of a large rewrite.
- Let code smells guide investigation, but fix the underlying design pressure rather than applying mechanical cleanup.
- Prefer improving names, boundaries, duplication, and dependency direction over cosmetic churn.
- Stop when the code is clearer for the current purpose. Do not expand into unrelated architecture work.

## Common Signals

- Repeated business rules or validation logic.
- Long functions with multiple levels of abstraction.
- Modules that expose internal sequencing to callers.
- Tests that require excessive mocking or setup.
- Changes that repeatedly touch the same unrelated files.

## Checklist

- Is the intended behavior protected by tests or characterization coverage?
- Can this change be reviewed as behavior-preserving?
- Is the refactor separate from unrelated feature work?
- Did validation pass after the change?
- Is the resulting design simpler for future changes?
