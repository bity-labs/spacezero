---
title: Security Review
---

## Principle

Security-sensitive changes should fail closed, expose only what is necessary, and make trust boundaries explicit.

## Rules

- Distinguish authentication from authorization. Knowing who a user is does not mean they may perform an action.
- Enforce authorization on the server or trusted boundary, not only in the UI.
- Apply least privilege to roles, tokens, API keys, database access, and service accounts.
- Validate and normalize untrusted input at system boundaries.
- Do not log secrets, tokens, private user data, or provider payloads that may contain sensitive fields.
- Keep secrets out of source code, client bundles, test fixtures, and error messages.
- Check for data exposure when changing queries, serialization, exports, permissions, or error responses.
- Use secure defaults. Deny unknown states, expired sessions, missing ownership, and unsupported redirects.
- Review token, link, and redirect flows for leakage, replay, and open redirect risk.

## Checklist

- What is the trust boundary touched by this change?
- Who is allowed to perform the action, and where is that enforced?
- Can one user access or infer another user's data?
- Are secrets and sensitive fields protected from logs and responses?
- Does the failure mode deny access by default?
