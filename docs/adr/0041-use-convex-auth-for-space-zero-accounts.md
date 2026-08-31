---
title: Use Convex Auth for Space Zero accounts
---

## Status

Accepted

## Context

Space Zero public builds require an activation gate, but the user-facing experience should not ask builders to paste license keys. The product needs a Space Zero Account that can capture a customer email, support product communication consent, attach paid or beta entitlements, and later provide a foundation for remote hosts, companion apps, teams, or cross-device flows.

The account system must support low-friction sign-in methods suitable for software builders:

- email one-time code
- GitHub OAuth as an account identity method
- linking both methods to one Space Zero Account when they represent the same verified email identity

GitHub repository access remains a separate product capability. Signing in with GitHub for account identity must not be confused with granting selected repository access to the Space Zero GitHub App.

Convex Auth supports magic links/OTPs, OAuth providers including GitHub, and account linking across trusted authentication methods by verified email. It also allows custom user creation/linking callbacks if the default behavior is not strict enough for Space Zero's entitlement model.

This decision builds on the public release and activation direction in `docs/adr/archive/v0/0018-public-macos-beta-distribution-updates-and-license-activation.md` and the GitHub credential boundary in `docs/adr/archive/v0/0012-github-app-authentication-and-process-boundaries.md`.

## Decision

Space Zero will use Convex and Convex Auth as the official Space Zero Account backend for v0 public builds.

- The monorepo has a separate Astro `apps/website` application for the commercial public website and a separate Next.js 16 `apps/account` application for Space Zero Account UI and backend behavior.
- The commercial website is hosted at `spacezero.dev`; the Account app is hosted at `account.spacezero.dev`.
- Purchase flow requires Space Zero Account sign-in before checkout.
- Checkout is initiated and completed from `apps/account` so the resulting entitlement attaches to the signed-in account.
- After successful checkout, `apps/account` presents a download handoff for the latest public Space Zero build.
- `apps/account` includes a minimal v0 account dashboard for entitlement/plan status, latest app download, billing management, product email opt-in/out, and linked identity status.
- Website signup and purchase entry points route through `apps/account` for Space Zero Account identity and checkout.
- Desktop sign-in uses the same Space Zero Account identity system through a system-browser flow that returns to the app with a `spacezero://` deep-link callback.
- The deep-link callback carries a short-lived desktop authorization code that the desktop exchanges with the Space Zero backend for account and activation state.
- The desktop stores refreshable account session material securely in encrypted app data, separate from the offline activation cache.
- Desktop may start the Local Host before activation for readiness, but workspace access remains blocked until account activation is valid.
- The Local Host must not receive account secrets or refreshable account session material; only non-secret account/activation status may cross the boundary when needed for feature gating.
- Supported v0 account identity methods are email OTP code and GitHub OAuth.
- Email OTP code is the primary email sign-in method for v0.
- v0 starts with Convex Auth's default trusted-method account linking by verified email for email OTP code and GitHub OAuth.
- Custom `createOrUpdateUser` account-linking logic is deferred unless validation shows ambiguous linking, duplicate paid accounts, or entitlement risk.
- No password-based account flow is part of v0.
- The user-facing activation flow is account-based and does not expose license-key entry.
- After initial sign-in, the desktop rechecks account, entitlement, and version support in the background when network access is available and refreshes the local offline grace window after valid checks.
- The desktop asks the user to sign in again only when the stored refreshable account session cannot be refreshed, backend policy requires reauthentication, or access is blocked because entitlement/version state is invalid and the offline grace period has elapsed.
- Polar remains the planned commerce and entitlement source, reached through Space Zero backend logic rather than directly from the desktop app.
- Space Zero stores product communication consent separately from required transactional account, billing, security, critical access, and activation emails.
- GitHub OAuth through Convex Auth is account identity only. Repository access is granted later in the desktop app through the Space Zero GitHub App/device-flow model and selected repository installation grants.
- Desktop Settings → Account preserves the existing v0 GitHub App repository-management capability for granting, managing, rechecking, and disconnecting selected repository access.

## Rationale

Convex Auth gives Space Zero the account capabilities needed for v0 without introducing a separate hosted authentication vendor or building authentication from scratch. Email OTP code keeps account creation low-friction and is predictable for a desktop sign-in flow, while GitHub OAuth matches the expected builder audience and can simplify later onboarding copy.

Using the Space Zero Account as the activation surface removes license-key copy/paste from the desktop UX while preserving entitlement enforcement behind the scenes. Polar can remain the system of record for purchases and beta grants, while Convex stores the product user identity and exposes the backend status needed by the desktop app.

Keeping GitHub identity separate from GitHub repository access avoids a confusing and unsafe product boundary. A user may sign into a Space Zero Account with GitHub but still need to install or manage the Space Zero GitHub App before Issues, Pull Requests, repository import, or PR creation are available. Preserving the existing v0 repository-management behavior keeps the GitHub row useful without weakening the GitHub App/security boundary.

Avoiding passwords in v0 reduces implementation, support, and security surface area. Starting with Convex Auth's default trusted-method linking keeps v0 small, while explicit validation covers the billing-sensitive edge cases. If account linking by verified email is insufficient for entitlement safety, Convex Auth's custom user creation/linking callbacks provide an escape hatch without changing the chosen backend.

## Consequences

- Space Zero needs Next.js 16 `apps/account` with a Convex backend for public account, minimal account dashboard, checkout, checkout success/download handoff, entitlement, communication-consent, and desktop activation status flows.
- Space Zero needs Astro `apps/website` for commercial landing, pricing entry, and download pages.
- Website and desktop sign-in must share the same account identity model.
- The desktop must support silent background activation rechecks and avoid repeated sign-in prompts during normal valid use.
- Desktop activation must be designed so Convex/Auth secrets, OAuth provider secrets, and refreshable account session material stay in encrypted trusted storage and do not enter the renderer, Session worktrees, logs, URLs beyond intended short-lived callback parameters, the Local Host, or agent transcripts.
- The desktop app must register and handle a `spacezero://` account-auth callback and exchange short-lived authorization codes with the Space Zero backend.
- The refreshable desktop account session and offline activation cache must be modeled separately.
- Local Host startup and account activation gating must be modeled separately so readiness work does not imply credential sharing.
- The implementation must test Convex Auth's default account-linking paths, including email-first then GitHub, GitHub-first then email, private GitHub emails, missing or unverified provider emails, and duplicate-account prevention.
- The UI must present account identity, GitHub identity, and GitHub repository access as distinct states.
- Password sign-in, SSO, teams, GitHub Enterprise identity, and multiple simultaneous GitHub identities remain out of v0 unless a later decision adds them.
- Existing license activation documentation and implementation plans should be updated from visible license-key entry to account-entitlement activation.

## Alternatives Considered

- Checkout before account creation — rejected because it can create orphan purchases and makes desktop activation harder to associate with a Space Zero Account.
- Visible license keys — rejected for the main v0 UX because they add friction and do not capture the account foundation Space Zero wants.
- GitHub-only account sign-in — rejected because some users may not want or be able to use GitHub for account identity, even if GitHub remains first-class for workflows.
- Email-only account sign-in — rejected because GitHub identity is valuable for builders and can simplify the mental model when repository workflows are later enabled.
- Build custom authentication from scratch — rejected because Convex Auth provides the required v0 primitives with less implementation and security risk.
- Use GitHub OAuth identity as repository authorization — rejected because account identity and selected-repository GitHub App authorization are separate security and product concepts.
- Add passwords in v0 — rejected because magic links/OTPs and GitHub OAuth cover the initial needs with less security and support burden.

## Review Trigger

Revisit this decision if Convex Auth cannot support the required desktop sign-in flow safely, account linking is unreliable for paid entitlement enforcement, Polar integration requires a different account authority, Space Zero needs enterprise SSO or teams earlier than expected, or public release scale requires moving account and entitlement state to a different backend.
