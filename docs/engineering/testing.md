---
title: Testing
---

## Principle

Tests should verify observable behavior through public interfaces, so implementation can change without breaking the suite.

## Rules

- Test what the caller can observe: returned values, state changes, emitted events, persisted data, and external side effects.
- Prefer integration-style tests around stable public interfaces over tests coupled to private functions or internal call order.
- Cover important boundaries: empty input, invalid input, authorization edges, limits, retries, and failure paths.
- Add a regression test for each bug when practical. The test should fail before the fix and pass after it.
- Treat tests as executable specifications. A reader should understand the intended behavior from the test name, setup, action, and assertions.
- Keep tests deterministic. Avoid real time, randomness, network calls, and shared global state unless controlled by the test.
- Assert outcomes, not implementation details. Do not lock in incidental structure just because it is easy to inspect.
- Keep test data small and meaningful. Each fixture should make the behavior under test easier to understand.

## Checklist

- Does the test exercise a public interface or user-observable behavior?
- Would the test still pass after a valid refactor?
- Are the important success, edge, and failure paths covered?
- If this fixes a bug, is there a regression test?
- Can the test fail for only one clear reason?
