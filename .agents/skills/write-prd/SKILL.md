---
name: write-prd
description: Turn the current clarified context into a PRD and publish it as a GitHub issue. Use when the idea or feature is understood and ready to be specified.
---

# Write PRD

Turn the current conversation, project context, and codebase understanding into a PRD published as a GitHub issue.

Do not restart discovery. Do not interview the user again unless a blocking ambiguity makes the PRD impossible to write.

Use the project language from:

- `docs/context.md`
- `docs/adr/`
- relevant code when needed

## Process

1. Review the current conversation and resolved decisions.
2. Read the relevant project context and ADRs.
3. Inspect the codebase only enough to understand current behavior and likely affected areas.
4. Draft the PRD using the template below.
5. Create the `prd` label in the target repository if it does not exist.
6. Publish the PRD as a GitHub issue with the `prd` label.
7. Report the issue link and recommend the next step: `break-into-issues`.

## PRD Template

### Problem Statement

Describe the problem from the user's point of view.

### Solution

Describe the intended solution from the user's point of view.

### User Stories

List the user-visible behaviors this PRD should support.

Use this format when useful:

```text
As a <actor>, I want <capability>, so that <benefit>.
```

### Acceptance Criteria

Define what must be true for the PRD to be considered complete.

Focus on observable behavior.

### Implementation Notes

Capture relevant technical direction without over-specifying stale details.

Include:

- modules or areas likely to change
- important interfaces or contracts
- schema or data model implications
- architecture constraints
- decisions already made

Avoid file-level implementation instructions unless they are essential.

### Testing Notes

Describe how this should be validated.

Include:

- behaviors that need test coverage
- existing test patterns to reuse
- boundaries where mocks or fakes may be appropriate

### Out of Scope

List what this PRD explicitly does not include.

### Further Notes

Capture useful context that does not fit elsewhere.

## GitHub Issue

Resolve the target repository before mutating GitHub:

```text
<owner/repo>
```

Create the label first if it does not exist in the target repository:

```bash
gh label create prd --repo <owner/repo> --description "Parent PRD issue" --color 0E8A16 2>/dev/null || true
```

Create the issue with the `prd` label:

```bash
gh issue create --repo <owner/repo> --label prd --body-file <prd-body-file>
```

## Stop Condition

Stop when the PRD issue exists.

End with:

- PRD issue link
- short summary
- recommended next step: `break-into-issues`
