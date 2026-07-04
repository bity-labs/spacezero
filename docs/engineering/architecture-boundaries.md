---
title: Architecture Boundaries
---

## Principle

Dependencies should point from volatile details toward stable policy so business behavior is not trapped inside framework or infrastructure code.

## Rules

- Keep business rules and use-case behavior separate from framework glue when the project has enough complexity to benefit from that boundary.
- Let infrastructure depend on application policy, not the reverse. Adapters should translate between external systems and internal concepts.
- Do not leak provider SDKs, request objects, database rows, or framework-specific types across boundaries unless that coupling is intentional.
- Put orchestration close to the use case and technical mechanics close to the adapter.
- Introduce boundaries to reduce change cost, not to perform architecture ceremony.
- Keep simple flows simple. A small project may need clear modules before it needs formal layers.
- Record important boundary decisions in ADRs when they affect future direction.
- Test business behavior without requiring the real framework or external service whenever practical.

## Checklist

- Which part of this change is business policy, application orchestration, adapter code, or framework glue?
- Does dependency direction protect stable rules from volatile details?
- Are external types contained at the edge?
- Is the boundary solving current complexity rather than adding ceremony?
- Should this decision be captured in an ADR?
