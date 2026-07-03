---
name: issues-triage
description: Triage GitHub issues into clear next states. Use when the user wants to process incoming issues, clarify a bug or feature request, decide whether an issue is ready for an agent, or manage issue readiness labels.
---

# Issues Triage

Turn a messy GitHub issue into a clear decision: needs more information, ready for an agent, ready for a human, or out of scope.

This skill is for externally sourced issues: bug reports, feature requests, and unclear tasks opened before the work was fully specified. Issues created by `write-prd`, `break-into-issues`, or `break-architecture-into-issues` are already structured and usually do not need this flow.

## Read These First

1. `docs/context.md` — domain language and project model
2. Relevant `docs/adr/` files — decisions that should not be re-litigated casually
3. `docs/coding-standards.md` — project conventions
4. Relevant code and tests for the issue area
5. `docs/engineering/debugging.md` — for bug reports that need reproduction
6. `docs/engineering/testing.md` — when deciding whether acceptance criteria are verifiable

If a doc is missing, say so and continue from issue/code evidence.

## Labels

Use one issue type label when useful:

- `bug` — reported behavior is broken
- `enhancement` — requested new behavior or improvement

Use one readiness/state label:

- `needs-triage` — not evaluated yet
- `needs-info` — blocked on reporter or product clarification
- `ready-for-agent` — clear, bounded, verifiable, and safe for an agent to implement
- `ready-for-human` — valid work, but requires human judgment before or during implementation
- `wontfix` — intentionally not actioned

Do not leave conflicting readiness labels on the same issue. If labels conflict, report the conflict before changing anything.

Resolve the target repository before mutating GitHub:

```text
<owner/repo>
```

Create missing labels in the target repository before applying them:

```bash
gh label create needs-triage --repo <owner/repo> --description "Needs maintainer triage" --color FBCA04 2>/dev/null || true
gh label create needs-info --repo <owner/repo> --description "Blocked on missing information" --color D93F0B 2>/dev/null || true
gh label create ready-for-agent --repo <owner/repo> --description "Ready for an agent to implement" --color 0E8A16 2>/dev/null || true
gh label create ready-for-human --repo <owner/repo> --description "Needs human implementation or decision" --color 5319E7 2>/dev/null || true
gh label create wontfix --repo <owner/repo> --description "Will not be actioned" --color B60205 2>/dev/null || true
```

## Workflow

### 1. Choose Issues to Triage

If the user gives an issue URL or number, triage that issue.

If the user asks generally what needs attention, list issues in this order:

1. unlabeled issues
2. issues labeled `needs-triage`
3. issues labeled `needs-info` with new reporter activity since the last triage comment

Use GitHub CLI, for example:

```bash
gh issue list --repo <owner/repo> --state open --json number,title,labels,updatedAt,author
```

Show a short list and let the user choose unless they already gave a target.

### 2. Gather Context

Read the full issue:

```bash
gh issue view <issue> --repo <owner/repo> --json number,title,body,comments,labels,author,state,url
```

Then inspect only enough project context to understand the request:

- relevant `docs/context.md` terms
- relevant ADRs
- code paths mentioned by the issue
- tests or examples that show expected behavior
- prior related issues when useful

If the repository has an `.out-of-scope/` directory, read matching files before recommending `wontfix` for an enhancement.

### 3. Classify the Issue

Classify the issue as:

- `bug`
- `enhancement`
- `unclear`

For each classification, explain the evidence briefly.

For bugs, attempt reproduction before asking the reporter for more details when possible:

- run the provided steps
- run a relevant test or command
- trace the likely code path
- state whether reproduction succeeded, failed, or is blocked by missing info/access

Do not deep-debug here. The goal is readiness, not root-cause analysis. If root cause work is needed, recommend `debug` after triage.

### 4. Decide Readiness

Recommend exactly one readiness state.

#### `ready-for-agent`

Use when the issue is clear enough for an AFK agent to implement safely.

Requirements:

- desired behavior is explicit
- scope is bounded
- acceptance criteria are testable
- no unresolved product or architecture decision blocks the work
- likely affected area is understandable from docs/code
- risks and out-of-scope boundaries are stated

Before applying `ready-for-agent`, write an agent brief comment.

#### `ready-for-human`

Use when the work is valid but should not be delegated AFK yet.

Reasons include:

- product judgment is required during implementation
- UX/design tradeoffs are unresolved
- architecture direction is unclear or high-risk
- security, legal, operational, or data migration risk needs human oversight
- reproduction requires private access or manual environment knowledge

Write the same structured brief style, but include why human involvement is required.

#### `needs-info`

Use when the next useful action is a question.

Ask specific, answerable questions. Capture what is already known so the reporter does not have to repeat themselves.

#### `wontfix`

Use when the request is intentionally rejected.

For bugs, explain why it is not considered a bug or why it will not be actioned.

For enhancements, prefer documenting durable out-of-scope decisions in `.out-of-scope/<concept>.md` when the repo uses that pattern.

### 5. Ask Before Mutating

Show the recommendation before changing GitHub:

```text
Recommendation: <bug/enhancement/unclear> + <state>
Reason: <short reason>
Actions I would take:
- add/remove labels: ...
- post comment: yes/no
- close issue: yes/no

Proceed?
```

### 6. Apply the Outcome

Use `gh issue edit --repo <owner/repo>`, `gh issue comment --repo <owner/repo>`, and `gh issue close --repo <owner/repo>` as needed.

Keep comments concise, durable, and useful to a future agent or maintainer.

When applying a state label, remove other state labels.

## Comment Templates

### Agent Brief

Post before moving to `ready-for-agent`.

```md
## Agent Brief

**Category:** bug / enhancement
**Summary:** <one-line summary>

**Current behavior:**
<what happens now, or the status quo>

**Desired behavior:**
<what should happen after this issue is done>

**Relevant context:**
- <domain term, interface, behavior, or constraint>
- <avoid brittle line-number instructions>

**Acceptance criteria:**
- [ ] <specific, testable criterion>
- [ ] <specific, testable criterion>

**Out of scope:**
- <nearby work that should not be included>

**Validation notes:**
<tests, commands, or reproduction notes that would prove the work>
```

### Human Brief

Post before moving to `ready-for-human`.

```md
## Human Brief

**Category:** bug / enhancement / unclear
**Summary:** <one-line summary>

**Why this needs a human:**
<decision, risk, access, or judgment required>

**What is known:**
- <resolved fact>
- <resolved fact>

**Recommended next decision:**
<the human choice needed before implementation>
```

### Needs Info

```md
## Triage Notes

**What we know so far:**
- <resolved fact>
- <resolved fact>

**What we still need:**
- <specific question>
- <specific question>
```

### Wontfix

```md
## Triage Decision

We are closing this as `wontfix`.

**Reason:**
<clear reason tied to project scope, existing decision, reproduction result, or duplicate out-of-scope concept>

**Related context:**
<link to ADR, docs, prior issue, or `.out-of-scope/` file when relevant>
```

## Stop Condition

Stop when the issue has one clear recommended or applied state.

End with:

- issue link
- final category
- final readiness state
- actions taken or waiting for approval
- remaining questions, if any
