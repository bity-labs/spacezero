---
title: Debugging
---

## Principle

Do not fix what you do not understand; reproduce, minimize, and gather evidence before changing behavior.

## Rules

- Reproduce the failure before editing code. If reproduction is impossible, state what evidence is missing.
- Minimize the case until the failing behavior is as small and deterministic as practical.
- Form falsifiable hypotheses. A useful hypothesis predicts what evidence should appear if it is true.
- Inspect the relevant code path, data, logs, tests, and recent changes before applying a fix.
- Add temporary instrumentation only to answer a specific question, then remove it before finishing.
- Prefer one change at a time. If the result changes, know which edit caused it.
- Add a regression test when practical so the bug cannot silently return.
- After fixing, verify the original reproduction path and any adjacent behavior that could be affected.

## Loop

1. Reproduce the bug.
2. Minimize the failing case.
3. Hypothesize the cause.
4. Instrument or inspect to test the hypothesis.
5. Fix the confirmed cause.
6. Add or update regression coverage.
7. Remove temporary debugging artifacts.

## Checklist

- Can the failure be reproduced reliably?
- What exact evidence supports the suspected cause?
- Is the fix targeted at the cause rather than the symptom?
- Is there regression coverage or a clear reason it is impractical?
- Were temporary logs, probes, and experiments removed?
