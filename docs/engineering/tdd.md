---
title: TDD
---

## Principle

Build behavior safely by taking one observable slice from failing test to passing implementation to cleanup before starting the next slice.

## Rules

- Start with one small failing test that describes the next behavior the system should expose.
- Make the test fail for the expected reason before writing the implementation.
- Write the smallest useful implementation that makes the test pass. Do not batch unrelated behavior into the same step.
- Refactor only when the relevant tests are green. Keep refactors behavior-preserving and verify after each meaningful change.
- Prefer vertical slices over isolated layers: exercise the path from public entrypoint to useful outcome whenever practical.
- For bug fixes, reproduce the bug with a failing regression test before changing production code when practical.
- Keep the loop tight. If a step becomes hard to reason about, reduce the scope of the test or split the behavior.
- Do not write a large test suite ahead of the implementation. Each test should pull the next design decision into the code.

## Loop

1. Red: write one failing test for the next observable behavior.
2. Green: implement the simplest code that makes it pass.
3. Refactor: improve names, structure, and duplication while tests stay green.
4. Repeat with the next behavior.

## Checklist

- Is there exactly one next behavior under test?
- Did the test fail before the implementation changed?
- Is the implementation minimal but not fake in a way that blocks the next slice?
- Are tests green before refactoring?
- Did the refactor preserve behavior?
