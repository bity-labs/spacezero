---
title: Interface Design
---

## Principle

Good interfaces make the common case simple, expose stable behavior, and hide decisions callers do not need to know.

## Rules

- Design from the caller's goal, not from the current implementation shape.
- Keep the public surface small. Every exported function, type, option, and event becomes a contract to maintain.
- Make dependencies explicit. Prefer parameters, constructors, or adapters over hidden globals and implicit environment access.
- Return useful results and errors. Do not force callers to inspect internal state or parse ambiguous responses.
- Hide implementation details behind names that describe domain behavior or technical capability.
- Avoid boolean flags that create unclear modes. Prefer named methods, explicit option objects, or separate concepts.
- Keep contracts stable. If behavior changes, update tests, docs, and callers together.
- Treat hard-to-test interfaces as design feedback. Add seams at real boundaries instead of patching internals.

## Checklist

- Can a caller understand what this interface does without reading its internals?
- Is the interface smaller than the implementation it hides?
- Are dependencies and failure modes explicit?
- Does the contract describe behavior rather than implementation?
- Will this interface remain useful after a reasonable refactor?
