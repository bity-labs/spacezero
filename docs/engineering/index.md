---
title: Engineering Rules
---

Load only the rule files needed for the task. Do not load every file by default.

## Core Rules

- `testing.md` — load when writing, changing, or reviewing tests.
- `tdd.md` — load when implementing behavior test-first or fixing bugs with regression coverage.
- `mocking.md` — load when replacing dependencies in tests or designing test seams.
- `interface-design.md` — load when creating or changing public APIs, module contracts, or adapters.
- `deep-modules.md` — load when reducing complexity, introducing abstractions, or changing module responsibilities.
- `refactoring.md` — load when improving structure without intended behavior changes.
- `code-review.md` — load when reviewing a change or preparing a change for review.

## Scoped Rules

- `debugging.md` — load when investigating bugs, failing tests, or behavior that is not yet understood.
- `legacy-code.md` — load when changing untested, risky, or poorly understood code.
- `architecture-boundaries.md` — load when changing layers, dependency direction, infrastructure adapters, or framework coupling.
- `domain-modeling.md` — load when naming or changing business concepts, rules, states, or events.
- `security-review.md` — load when touching auth, permissions, secrets, user input, redirects, or data exposure.
- `data-modeling.md` — load when changing schemas, persistence, migrations, consistency, or data ownership.

## Rule Loading Protocol

1. Identify the task type and risk.
2. Load the smallest set of relevant rule files.
3. Follow `docs/coding-standards.md` for project-level expectations.
4. If the task crosses into another risk area, load the additional scoped rule before editing further.
