---
title: Data Modeling
---

## Principle

Data models should reflect access patterns, ownership, consistency needs, and future evolution instead of only today's object shape.

## Rules

- Design around the queries, writes, and invariants the product actually needs.
- Make ownership explicit with stable identifiers and clear relationships.
- Define consistency boundaries. Know which changes must be atomic and which can be eventually consistent.
- Avoid storing the same fact in multiple places unless there is a deliberate synchronization strategy.
- Plan schema evolution before changing persisted data: compatibility, migrations, backfills, and rollback.
- Preserve existing readers and writers during rollout when old and new shapes may coexist.
- Validate data at write boundaries so invalid states are hard to persist.
- Consider privacy and retention when adding new stored fields.
- Document important data ownership or migration decisions in ADRs when they affect future work.

## Checklist

- What are the main access patterns for this data?
- Who owns this record or field?
- Which invariants must be preserved transactionally?
- Can old data and old code survive the change during rollout?
- Is a migration, backfill, or ADR needed?
