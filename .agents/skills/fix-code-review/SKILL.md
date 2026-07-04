---
name: fix-code-review
description: Address GitHub PR review feedback with minimal, verified changes. Use when the user says "fix review comments", "address PR feedback", "fix code review", or provides a GitHub PR URL with requested changes.
---

# Fix Code Review

Address PR review feedback with minimal, verified changes, then push the fixes and move the PR back to review.

## Read These First

1. `docs/engineering/code-review.md` — review principles and severity model
2. `docs/coding-standards.md` — repo conventions
3. `docs/context.md` — domain language and project model
4. Relevant `docs/adr/` files for the area being touched
5. `docs/engineering/testing.md` and `docs/engineering/refactoring.md` when the feedback requires tests or code cleanup

## Workflow

### 1. Identify the PR

If no PR URL is provided, ask the user for one.

Parse the URL into:

- repository owner/name
- PR number
- head branch
- base branch

Fetch the PR metadata:

```bash
gh pr view <PR_URL> --json title,body,author,baseRefName,headRefName,files,reviews,comments
```

### 2. Switch to the PR Worktree

Always work in a separate worktree for the PR. Do not fix review comments from the base checkout.

Use a stable worktree path:

```text
.worktrees/pr-<pr-number>
```

Check whether the worktree already exists:

```bash
git worktree list --porcelain
```

If `.worktrees/pr-<pr-number>` already exists, use it and update the PR branch from inside that worktree:

```bash
cd .worktrees/pr-<pr-number>
gh pr checkout <PR_URL>
```

If it does not exist, create it, then check out the PR from inside the new worktree:

```bash
git worktree add .worktrees/pr-<pr-number>
cd .worktrees/pr-<pr-number>
gh pr checkout <PR_URL>
```

`gh pr checkout` handles same-repo and fork PRs better than manually fetching `origin/<head-branch>`. If checkout fails, inspect the real PR head repository and branch:

```bash
gh pr view <PR_URL> --json headRefName,headRepository,headRepositoryOwner
```

Fork PRs may not have a writable branch on the base repository. If you cannot check out or push to the PR head, stop and report the permission problem.

Run all following steps from the PR worktree.

### 3. Fetch Review Feedback

Fetch all relevant feedback, because GitHub stores it in different places.

```bash
# Line-specific review comments
gh api repos/<owner>/<repo>/pulls/<pr-number>/comments

# Review summaries and states
gh pr view <pr-number> --repo <owner/repo> --json reviews

# General PR conversation comments
gh pr view <pr-number> --repo <owner/repo> --json comments
```

Line-specific review comments are usually the most important. General conversation comments may include product or scope decisions.

### 4. Classify Feedback

Classify every actionable item before changing code.

Use these categories:

- `required` — blocker or important feedback that must be addressed before merge
- `safe-suggestion` — optional feedback that is clearly correct, low-risk, and small
- `optional` — valid suggestion, but not necessary for this PR
- `unclear` — needs a human decision or has multiple plausible interpretations
- `not-applicable` — incorrect, stale, already fixed, or conflicts with project doctrine

For each item, record:

- source comment or reviewer
- file and line if available
- requested change
- category
- planned fix or reason not to fix

### 5. Ask What to Fix

If the user is present, ask which scope to apply:

```text
What should I fix?

1. Required only
   Fix blockers and required important improvements.

2. Required + safe suggestions
   Fix required items and low-risk suggestions that are clearly correct.

3. All actionable feedback
   Fix required, safe-suggestion, and optional items that are valid and actionable.

4. Custom
   You choose specific comments/items to fix.

Recommended: Required only.
```

If running unattended, use `Required only`.

Do not fix `unclear` or `not-applicable` items without user instruction. Mention them in the summary instead.

### 6. Build the Fix Plan

Create a short plan for the selected scope:

```md
## Fix Plan

1. `src/example.ts:42`
   - Feedback: <review comment summary>
   - Category: required
   - Plan: <minimal change>

2. `src/other.ts:10`
   - Feedback: <review comment summary>
   - Category: safe-suggestion
   - Plan: <minimal change>
```

If the user is present, show the plan before editing. If running unattended, proceed with the selected default scope.

### 7. Apply Minimal Fixes

Apply only the selected review feedback.

Rules:

- Do not expand scope.
- Do not refactor unrelated code.
- Do not change behavior beyond what the feedback requires.
- Keep fixes small and reviewable.
- Preserve project vocabulary and conventions.
- Add or update tests when the feedback changes behavior or guards a risk.

### 8. Validate

Run the relevant validation commands for the changed area, such as:

- tests
- typecheck
- lint
- build

Use `docs/coding-standards.md` and project scripts to choose the commands.

If validation fails:

1. Make a targeted fix.
2. Re-run validation.
3. If still failing after a reasonable attempt, stop without pushing broken code and report the failure.

### 9. Commit and Push

Commit only the review-fix changes.

```bash
git add -A
git commit -m "fix(review): address PR #<pr-number> feedback"
```

Push back to the PR head branch, not automatically to `origin`.

For a same-repository PR, this is usually:

```bash
git push origin HEAD:<head-branch>
```

For a fork PR, push to the writable remote for the PR head repository, or stop and report that you cannot push if you do not have permission.

The commit body should summarize the substantive changes, not just say "fixed comments".

### 10. Move PR Back to Review

After pushing fixes, keep only `needs-review` active so maintainers can filter PRs waiting for another review.

Ensure labels exist:

```bash
gh label create needs-review --repo <owner/repo> --description "PR status: ready and waiting for review" --color 5319E7 2>/dev/null || true
gh label create changes-requested --repo <owner/repo> --description "PR status: reviewed and requires changes before merge" --color D73A4A 2>/dev/null || true
gh label create ready-to-merge --repo <owner/repo> --description "PR status: reviewed and ready to merge" --color 0E8A16 2>/dev/null || true
```

Update the PR:

```bash
gh pr edit <pr-number> --repo <owner/repo> \
  --remove-label changes-requested \
  --remove-label ready-to-merge \
  --add-label needs-review
```

Do not set `ready-to-merge`; the reviewer still needs to verify the fixes.

### 11. Post Summary Comment

Post a PR comment summarizing what changed.

```md
## Review Feedback Addressed

Scope: Required only / Required + safe suggestions / All actionable feedback / Custom

Fixed:
- ✅ `<file:line>` — <what changed>

Not fixed:
- ⚠️ `<file:line>` — <unclear / optional / not-applicable reason>

Validation:
- ✅ `<command>` passed
- ❌ `<command>` failed: <reason, if any>

Pushed: `<commit-sha>`
PR status: `needs-review`
```

Then print the same summary locally for the user.

## Guardrails

- Ask the user what scope to fix when they are present.
- If unattended, fix required feedback only.
- Do not blindly obey review comments; classify them against project doctrine and current code.
- Do not fix unclear items without user instruction.
- Do not expand PR scope.
- Never push broken code.
- Always move the PR back to `needs-review` after pushing fixes.
