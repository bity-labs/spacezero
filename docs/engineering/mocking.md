---
title: Mocking
---

## Principle

Mocks should isolate real system boundaries, not replace code the project owns or freeze internal implementation details.

## Rules

- Mock external boundaries: network services, payment providers, email delivery, queues, clocks, randomness, file systems, and other slow or nondeterministic dependencies.
- Do not mock modules owned by the project just to make a test easier. Prefer testing through a public interface that uses the real collaboration.
- Prefer small fakes or in-memory adapters over complex mocks when they better represent boundary behavior.
- Inject external clients or adapters explicitly so tests can replace boundaries without patching internals.
- Assert the outcome of the behavior, not every internal call. Verify interactions only when the interaction itself is the observable contract.
- Keep mocks simple. A mock with many expectations, branches, or ordered calls is usually a signal that the interface is too complicated.
- Do not use mocks to hide unclear design. If a test needs excessive setup, improve the seam or public interface.
- Keep mocked behavior realistic enough to catch integration mistakes, including common failures and edge cases.

## Example

Good boundary seam:

```text
Application code depends on an EmailSender interface.
Tests use an in-memory fake EmailSender and assert which message would be sent.
Production uses the real provider adapter.
```

Avoid:

```text
A test mocks three private helper modules and asserts they were called in a specific order.
```

That test describes the implementation, not the behavior.

## Checklist

- Is the mocked thing outside the project or genuinely nondeterministic?
- Could a fake or real in-memory implementation make the test clearer?
- Does the test assert behavior rather than incidental call order?
- Is the seam explicit in the design instead of patched into the test?
- Is a complicated mock revealing an interface that should be simplified?
