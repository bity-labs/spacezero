---
name: fix-code-review
description: Address required GitHub PR review findings when the user or an unattended controller explicitly requests fixes and the PR is currently labeled changes-requested. Do not invoke for ready-to-merge, human-review-required, PR analysis, or when a PR URL is merely mentioned.
---

# Fix Code Review

Address the required findings from one current, SHA-aware review with minimal verified changes. Push one fix pass, then move the PR back to `needs-review` for focused verification.

## Read These First

1. `docs/engineering/code-review.md` — review principles, severity, and convergence rules
2. `docs/coding-standards.md` — repo conventions
3. `docs/context.md` — domain language and project model
4. Relevant `docs/adr/` files for the area being touched
5. `docs/engineering/testing.md` and `docs/engineering/refactoring.md` when feedback requires tests or cleanup

## Trigger Boundary

Run this skill only when:

- the user explicitly requests review fixes; or
- an unattended controller dispatches a fix pass;
- **and** the PR currently has exactly the active review state `changes-requested`.

Do not edit, commit, push, comment, or mutate labels when:

- the PR has `ready-to-merge`;
- the PR has `human-review-required`;
- the PR does not have `changes-requested`;
- the task is review-loop analysis or PR history explanation; or
- the PR URL is merely mentioned.

`ready-to-merge` and `human-review-required` are terminal for unattended fix automation.

## Workflow

### 1. Identify and Snapshot the PR

Require an explicit PR URL or unambiguous PR number. Fetch:

```bash
gh pr view <PR_URL> --json number,title,body,author,baseRefName,headRefName,headRefOid,isDraft,state,labels,files,reviews,comments
```

Record:

- repository owner/name;
- PR number;
- head and base branches;
- current full head SHA as `current_head`;
- current labels.

Require all of these before continuing:

- PR is open and non-draft;
- `changes-requested` is present;
- `ready-to-merge`, `needs-review`, and `human-review-required` are absent.

If the label state is inconsistent, stop without mutation and report it.

### 2. Resolve the Latest Machine-Readable Review

Inspect PR comments in chronological order and locate the latest valid marker:

```html
<!-- tstack-review {"head":"<full-head-sha>","round":2,"mode":"verification","status":"changes-requested"} -->
```

Validate:

- metadata parses as JSON;
- `head` is a full SHA and equals `current_head`;
- `round` is `1` or `2` (`changes-requested` is invalid in round 3);
- `mode` matches the review protocol;
- `status` is exactly `changes-requested`;
- the review body contains at least one concrete item under **Required Changes**.

If metadata is absent, malformed, stale, or inconsistent with labels/prose, stop without editing. Do not guess which feedback applies.

Record the metadata SHA as `reviewed_head` and round as `review_round`.

### 3. Switch to the PR Worktree

Always work in a separate stable worktree:

```text
.worktrees/pr-<pr-number>
```

Check existing worktrees:

```bash
git worktree list --porcelain
```

If the worktree exists, use it and update the PR branch:

```bash
cd .worktrees/pr-<pr-number>
gh pr checkout <PR_URL>
```

If it does not exist:

```bash
git worktree add .worktrees/pr-<pr-number>
cd .worktrees/pr-<pr-number>
gh pr checkout <PR_URL>
```

`gh pr checkout` handles same-repository and fork PRs better than manually guessing a remote branch. If checkout or push permission fails, stop and report it.

Before editing, require:

```bash
git rev-parse HEAD
```

to equal `reviewed_head`, and require a clean worktree. Never reset or discard unexpected work.

### 4. Fetch and Classify Feedback

Fetch all feedback channels for context:

```bash
gh api repos/<owner>/<repo>/pulls/<pr-number>/comments
gh pr view <pr-number> --repo <owner/repo> --json reviews,comments
```

The associated metadata review is the automation contract. Classify its actionable items as:

- `required` — listed under **Required Changes** and must be addressed before merge;
- `optional` — non-blocking follow-up;
- `unclear` — needs a human decision or has multiple plausible interpretations;
- `not-applicable` — stale, already fixed, incorrect, or conflicts with project doctrine.

For each item record:

- source review and review round;
- file/line or behavior;
- requested change;
- category;
- planned fix or reason not to fix.

In unattended mode, apply **required items only**. Never automatically apply optional, “safe suggestion,” cleanup, or follow-up work.

If any required item is unclear, contradictory, architectural, product-changing, security-sensitive without a clear safe fix, or scope-expanding, stop and escalate instead of inventing a decision.

If the associated review contains no valid required items, make no changes, commit, comment, or label transition. Report the inconsistent `changes-requested` state.

### 5. Select Fix Scope

If the user is present, show the required-item classification and ask whether to apply all or a specified subset. Do not offer optional feedback as part of the default fix scope.

If unattended, select all clear required items and only those items.

Build a short plan:

```md
## Fix Plan

Review round: <round>
Reviewed head: <full SHA>

1. `src/example.ts:42`
   - Required finding: <summary>
   - Plan: <minimal change>
```

### 6. Apply Minimal Fixes

Rules:

- Address only selected required findings.
- Do not expand scope or refactor unrelated code.
- Do not change behavior beyond what the finding requires.
- Keep fixes small and reviewable.
- Preserve project vocabulary and conventions.
- Add or update regression tests when behavior or risk changes.
- Avoid touching unchanged code merely because a new improvement was noticed.

### 7. Validate

Run focused checks for the changed area and all repository-required validation appropriate to the risk, such as:

- tests;
- typecheck;
- lint;
- build;
- relevant end-to-end coverage.

Use `docs/coding-standards.md` and project scripts to choose commands.

If validation fails:

1. make a targeted correction within the approved required scope;
2. rerun validation;
3. if it still fails, stop without pushing broken code and report the failure.

### 8. Recheck the Remote Head Before Commit and Push

Before committing, refetch the PR head:

```bash
gh pr view <PR_URL> --json headRefOid
```

Require it to still equal `reviewed_head`. If another actor advanced the PR, stop. Do not commit or push fixes based on stale feedback.

Review the local diff and ensure it contains substantive changes that address the required findings. If there is no diff, make no empty commit and do not transition labels.

### 9. Commit and Push

Commit only the review-fix changes:

```bash
git add -A
git commit -m "fix(review): address PR #<pr-number> round <review-round> feedback"
```

Push to the PR head branch, not automatically to an assumed remote:

```bash
git push origin HEAD:<head-branch>
```

For fork PRs, push to the writable PR-head remote or stop if permission is unavailable.

After pushing, fetch the PR again and require its head SHA to have advanced. Record the new full SHA as `pushed_head`.

### 10. Move the PR Back to Focused Verification

Only after a successful substantive push, keep exactly `needs-review` active:

```bash
gh label create needs-review --repo <owner/repo> --description "PR status: ready and waiting for review" --color 5319E7 2>/dev/null || true
gh label create changes-requested --repo <owner/repo> --description "PR status: reviewed and requires changes before merge" --color D73A4A 2>/dev/null || true
gh label create ready-to-merge --repo <owner/repo> --description "PR status: reviewed and ready to merge" --color 0E8A16 2>/dev/null || true
gh label create human-review-required --repo <owner/repo> --description "PR status: automated review budget exhausted; human decision required" --color B60205 2>/dev/null || true

gh pr edit <PR_URL> \
  --remove-label changes-requested \
  --remove-label ready-to-merge \
  --remove-label human-review-required \
  --add-label needs-review
```

Do not set `ready-to-merge`; a fresh reviewer must verify this fix delta. Do not move to `needs-review` when no commit was pushed.

### 11. Post the Fix Summary

Post a PR comment:

```md
## Review Feedback Addressed

Review round: <round>
Reviewed head: `<reviewed-head-sha>`
Pushed head: `<new-head-sha>`
Scope: Required only / User-selected required subset

Fixed:

- ✅ `<file:line>` — <what changed>

Not fixed:

- ⚠️ `<file:line>` — <unclear/not-applicable reason>

Validation:

- ✅ `<command>` passed
- ❌ `<command>` failed: <reason, if any>

PR status: `needs-review`
```

The round and reviewed SHA must match the source review metadata. Then print the same summary locally.

## Guardrails

- Run only from a consistent `changes-requested` state.
- Never run from `ready-to-merge` or `human-review-required` in unattended mode.
- Never act on review metadata whose head differs from the current PR head.
- If unattended, fix required feedback only.
- Never apply optional or follow-up work automatically.
- Do not fix unclear items without a human decision.
- Do not expand PR scope.
- Never push broken code.
- Never create an empty review-fix commit.
- Move to `needs-review` only after pushing substantive validated fixes.
- Preserve the review round and reviewed SHA in the fix summary.
