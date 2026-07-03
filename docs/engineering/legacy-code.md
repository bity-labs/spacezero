---
title: Legacy Code
---

## Principle

Treat risky or untested code as code that must first be understood and protected before it is changed.

## Rules

- Define legacy risk by missing safety, not age. New code without tests can be legacy code.
- Understand the current behavior before judging whether it is correct.
- Add characterization tests around existing behavior before changing risky areas.
- Create seams at boundaries where dependencies make testing or change difficult.
- Prefer small dependency-breaking changes over broad rewrites.
- Change one behavior at a time and verify after each step.
- Preserve existing behavior unless the task explicitly requires changing it.
- Document surprising behavior when it is intentionally preserved.

## Safe Change Strategy

1. Identify the behavior that must change.
2. Find the smallest public or stable seam that exposes it.
3. Add characterization coverage for current behavior.
4. Make the minimal change.
5. Add or update tests for the intended behavior.
6. Refactor only after the suite is green.

## Checklist

- What behavior must stay the same?
- What behavior must change?
- Is there characterization coverage for the risky path?
- Is the seam explicit enough for future tests?
- Was a rewrite avoided unless clearly justified?
