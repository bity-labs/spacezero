---
name: break-into-issues
description: Break a PRD, spec, or plan into independently grabbable GitHub issues using vertical slices. Use when the user wants to turn a PRD into implementation issues.
---

# Break Into Issues

Break the PRD, spec, or plan into GitHub issues that can be implemented independently.

Use vertical slices. Do not create horizontal layer tickets.

A good issue delivers a narrow, complete behavior that can be tested, reviewed, and merged on its own.

## Process

### 1. Gather Context

Use the current conversation context.

Resolve the target repository before reading or mutating GitHub:

```text
<owner/repo>
```

If the user provides a GitHub issue number or URL, fetch it and read the full issue before planning:

```bash
gh issue view <issue> --repo <owner/repo> --json title,body,comments
```

Read relevant project context:

- `docs/context.md`
- `docs/adr/`
- relevant code when needed

Use the project's domain language in issue titles and descriptions.

### 2. Draft Vertical Slices

Break the plan into tracer-bullet issues.

Each issue is a thin vertical slice that cuts through all required integration layers end-to-end. It is not a horizontal slice of one layer.

A slice may be:

- `AFK` — clear enough for an agent to implement and merge without more human decisions.
- `HITL` — requires human interaction before or during implementation, such as an architectural decision, product decision, design review, or unclear tradeoff.

Prefer `AFK` over `HITL` when the scope and acceptance criteria can be made clear.

Each slice must:

- deliver a narrow but complete path through the necessary layers, such as schema, API, UI, and tests
- be demoable or verifiable on its own when completed
- be small enough to review safely

Prefer many thin slices over a few thick ones.

Avoid horizontal issues like:

- set up database
- build API
- build UI
- write tests

Prefer behavior issues like:

- user can create X
- user can view X
- user can update X state
- system handles X failure case

### 3. Ask for Approval

Before creating issues, show the proposed breakdown.

For each slice include:

- title
- mode: `AFK` or `HITL`
- blocked by
- behavior covered
- short acceptance criteria

Ask the user to confirm:

- granularity
- dependencies
- missing slices
- slices to merge or split
- `AFK` / `HITL` classification

Iterate until approved.

### 4. Publish to GitHub

Create each approved slice as a GitHub issue in the target repository.

Use `issue-template.md` for each issue body.

Apply the `ready-for-agent` label.

Create the label first if it does not exist in the target repository:

```bash
gh label create ready-for-agent --repo <owner/repo> --description "Ready for an agent to implement" --color 0E8A16 2>/dev/null || true
```

Publish blockers first so dependent issues can reference real issue numbers.

Do not close or modify the parent PRD issue unless the user asks.

## Stop Condition

Stop when all approved issues have been created.

End with:

- created issue links
- dependency order
- which issues are ready for agents now
- any HITL issues that still need human input
