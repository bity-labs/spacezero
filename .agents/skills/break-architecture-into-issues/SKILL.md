---
name: break-architecture-into-issues
description: Break an architecture opportunity issue into ready-for-agent refactor task issues. Use when the user wants to turn an architecture opportunity into concrete implementation tasks.
---

# Break Architecture Into Issues

Break one architecture opportunity into concrete GitHub issues that agents can implement one task at a time.

A good refactor task is small, behavior-preserving by default, scoped to the parent opportunity, and clear enough to commit into the parent branch.

## Process

### 1. Gather Context

Require an architecture opportunity issue URL or number.

Resolve the target repository before reading or mutating GitHub:

```text
<owner/repo>
```

Fetch and read the parent issue:

```bash
gh issue view <issue> --repo <owner/repo> --json title,body,comments,labels
```

The parent issue should have the `architecture-opportunity` label.

Read relevant project context only as needed:

- `docs/context.md`
- relevant `docs/adr/`
- `docs/engineering/refactoring.md`
- `docs/engineering/testing.md`
- `docs/engineering/interface-design.md`
- relevant code for the area being decomposed

Use the project's domain language in issue titles and descriptions.

### 2. Check Blocking Questions

Before creating task issues, check whether the parent opportunity has unresolved blocking questions.

If blocking questions remain, show them to the user and ask whether they want to answer now or leave the opportunity for later.

Do not create `ready-for-agent` task issues while blocking questions remain.

### 3. Draft Refactor Tasks

Break the architecture opportunity into implementation tasks.

Each task should:

- move the codebase one clear step toward the desired architecture
- preserve behavior unless the parent opportunity explicitly requires a behavior change
- be small enough for one agent to implement safely
- have clear acceptance criteria
- include validation expectations
- state what is out of scope
- link back to the parent architecture opportunity

Prefer tasks like:

- add characterization tests around payment status handling
- introduce a payment state module with current mappings
- move webhook status handling behind the payment state module
- remove duplicated payment status mapping after callers are migrated

Avoid vague or horizontal tasks like:

- clean up payments
- refactor services
- improve tests
- update architecture

### 4. Ask for Approval

Before creating issues, show the proposed breakdown.

For each task include:

- title
- blocked by
- goal
- acceptance criteria
- validation
- out of scope

Ask the user to confirm:

- task granularity
- dependencies
- missing tasks
- tasks to merge or split
- whether each task is clear enough for `ready-for-agent`

Iterate until approved.

### 5. Publish to GitHub

Create each approved task as a GitHub issue in the target repository.

Apply the `ready-for-agent` label to each task issue.

Create the label first if it does not exist in the target repository:

```bash
gh label create ready-for-agent --repo <owner/repo> --description "Ready for an agent to implement" --color 0E8A16 2>/dev/null || true
```

Publish blockers first so dependent issues can reference real issue numbers.

Do not close or modify the parent architecture opportunity unless the user asks.

Issue body template:

```md
## Parent Architecture Opportunity
#<PARENT_ISSUE_NUMBER>

## Refactor Task
<what structural step this task performs>

## Acceptance Criteria
- [ ] Existing behavior is preserved unless explicitly stated otherwise
- [ ] <task-specific criterion>
- [ ] <task-specific criterion>

## Validation
- <test/typecheck/lint/build command or expected check>

## Blocked By
- #<issue>

Or:

None — can start immediately.

## Out of Scope
- <what this task must not change>
```

## Stop Condition

Stop when all approved task issues have been created.

End with:

- created issue links
- dependency order
- which tasks can start immediately
- any tasks blocked by earlier tasks
