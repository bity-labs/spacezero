---
title: Deep Modules
---

## Principle

A module should hide meaningful complexity behind a simpler interface, reducing what the rest of the system must understand.

## Rules

- Prefer deep modules: small public interfaces with substantial internal responsibility.
- Avoid shallow wrappers that add names, files, and indirection without hiding complexity.
- Push complexity inward when it belongs to one concept. Do not spread the same decision across many callers.
- Hide volatile details such as provider APIs, storage layout, protocol quirks, and formatting rules.
- Keep knowledge in one place. Duplication of business rules or assumptions is more dangerous than duplicated syntax.
- Do not abstract only because two things look similar. Abstract when they represent the same knowledge or policy.
- Make modules orthogonal. A change in one concern should not require unrelated changes elsewhere.
- Choose strategic design over tactical patches when the current change would deepen existing complexity.

## Signs of a Shallow Module

- The interface is almost as complicated as the implementation.
- Callers must know the order of internal steps.
- Most methods simply pass data through to another module.
- A change requires touching many files that repeat the same rule.

## Checklist

- What complexity does this module hide?
- Is the public API smaller and more stable than the internals?
- Are callers protected from volatile implementation details?
- Is this abstraction removing knowledge duplication or only moving code around?
