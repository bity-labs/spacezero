---
name: implement-with-tdd
description: Implement clear behavior using test-driven development. Use when the user wants to build something test-first, add behavior through red-green-refactor, or implement a well-specified change with tests.
---

# Implement With TDD

Implement clear behavior one verified slice at a time.

## Read These First

1. `docs/engineering/tdd.md` — the loop and rules
2. `docs/engineering/testing.md` — test philosophy
3. `docs/engineering/mocking.md` — when and how to mock
4. `docs/engineering/interface-design.md` — designing testable seams
5. `docs/coding-standards.md` — repo-specific conventions
6. `docs/context.md` — glossary and domain language
7. Relevant `docs/adr/` files for the area being touched

## Workflow

### 1. Plan

Before writing code:

- Understand the target behavior from the user's request.
- Propose the interface changes needed (entrypoint, parameters, return type).
- List the behaviors to test, in the order you will tackle them.
- Flag any deep-module, boundary, or mocking concerns.

If the user is present (HITL), present the plan and wait for explicit approval before proceeding.
If running unattended (AFK), proceed with the plan directly.

### 2. Tracer Bullet

One RED → GREEN cycle to prove the path:

1. Write one test for the simplest behavior.
2. Confirm it fails for the expected reason.
3. Write the minimal code to pass.
4. Confirm green.

### 3. Incremental Loop

For each remaining behavior, repeat:

1. **Red**: write one failing test.
2. **Green**: write the minimal code to pass.
3. Confirm green before moving on.

Rules:

- One test at a time.
- Only enough code for the current test.
- Do not anticipate future tests.
- Stay on public interfaces. Do not test implementation details.
- Follow `docs/coding-standards.md` for test naming, structure, and tooling.

### 4. Refactor

When the current set of tests passes:

1. Propose one refactor at a time (naming, duplication, boundaries).
2. Confirm green after each change.
3. Stop when the code is clear enough for the current purpose.

Never refactor while RED.

## Checklist Per Cycle

- [ ] Test describes behavior, not implementation
- [ ] Test uses public interface only
- [ ] Test would survive an internal refactor
- [ ] Implementation is minimal for this test
- [ ] No speculative features added
- [ ] Refactor only from GREEN
