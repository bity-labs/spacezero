---
title: Public macOS beta distribution, updates, and license activation
---

## Status

Accepted

## Context

Space Zero needs a first public distribution path. Even if the first external users are beta users, the app will be publicly downloadable and should not rely on ad hoc internal build sharing.

The project already uses Electron and `electron-builder`, and ADR 0001 identified platform-specific signing, notarization, and distribution as future decisions. Public desktop distribution also intersects with commercial access: installer artifacts can be public, but app usage should be gated by a license. Space Zero plans to use Polar for commerce and license keys.

The initial platform focus is macOS. Windows and Linux may remain buildable, but they are not first-class public auto-update targets for v0.

This decision builds on ADR 0001, ADR 0002, and ADR 0012.

## Decision

Space Zero will use a public macOS beta release path with GitHub-hosted artifacts, signed/notarized builds, auto-update, and whole-app license activation.

- The commercial website is the polished public download entry point.
- GitHub Releases host public release artifacts, update metadata, and canonical v0 release notes.
- The website points macOS users to a Developer ID signed and Apple-notarized DMG.
- Release builds may also publish ZIP and updater metadata artifacts required by Electron auto-update.
- Public macOS release artifacts are built, signed, notarized, and published by GitHub Actions.
- Public beta releases are triggered by pushing a version tag such as `v0.1.0-beta.1`.
- The release workflow verifies the tag matches `package.json` before publishing.
- Initial public releases use a single beta channel with SemVer prerelease versions; stable can be added later.
- Auto-update uses `electron-updater` with `electron-builder` and GitHub Releases.
- The app checks for updates on launch and periodically while open.
- Updates download automatically in the background and ask the user to restart/apply after download.
- If sessions or terminals are active, restart/apply warns the user but remains user-controlled.
- Update UI appears both as a highlighted affordance near the user account area in the App Sidebar and as detailed controls in Settings/About.

Space Zero public builds gate whole-app usage through License Activation:

- Polar is the commerce and licensing system.
- The desktop app does not embed Polar secret API credentials.
- A minimal Space Zero backend validates license keys and version policy with Polar.
- The desktop app calls one Space Zero backend status endpoint for license state, recheck/grace timing, version support, renewal/reactivation URL, and update/download URL when needed.
- Activation uses a hybrid model: online validation plus cached local entitlement for offline use during a 7-day grace period.
- Cached entitlement is stored under the OS application-data directory and encrypted with Electron `safeStorage`, owned by the main process.
- Renderer code only receives activation state through typed IPC.
- Public onboarding order is Welcome, License Activation, GitHub connection, then optional Project setup.
- Public builds cannot skip activation; development builds may provide a bypass or mock activation.
- Expired, revoked, or invalid licenses block workspace access after the 7-day grace period and show a renewal/reactivation path.
- Normal updates are user-controlled, but the backend may mark a build unsupported for critical security, backend compatibility, or licensing reasons; unsupported public builds block workspace access until updated.

## Rationale

GitHub Releases are the simplest release host for v0 because Space Zero already treats GitHub as a first-class workflow surface, `electron-builder` integrates with GitHub release publishing, and `electron-updater` can consume GitHub-hosted update metadata. A commercial website can still provide the polished download experience without owning binary hosting immediately.

Focusing macOS first keeps the first public release path small while solving the strictest trust requirements early. Developer ID signing and notarization avoid Gatekeeper-blocking warnings and establish user trust for a desktop app that can operate on local repositories, terminals, credentials, and agent sessions.

GitHub Actions provides a reproducible public release path. Local-only releases would make signing, notarization, artifact metadata, and update publishing easier to get wrong.

Publicly hiding the installer is not a meaningful license boundary. Whole-app License Activation protects product access while keeping downloads simple. Polar supplies commerce and license entitlements, but the desktop app must not ship vendor secrets. A minimal Space Zero backend keeps commercial policy server-side and gives Space Zero one place to enforce version support later.

A 7-day cached entitlement grace period balances desktop usability with licensing control. Space Zero's core AI workflows generally need internet access, so a shorter grace period is acceptable.

`electron-updater` is preferred over Electron's lower-level `autoUpdater` because the project already uses `electron-builder` and needs the shortest reliable path to macOS update metadata, background download, and restart/apply flows.

## Consequences

- Release automation needs GitHub Actions secrets for Apple Developer ID signing and notarization.
- The release workflow must fail before publishing if signing, notarization, version/tag validation, or update metadata generation fails.
- The app needs a new update service in main, typed preload/IPC contracts, renderer update status UI, and Settings/About controls.
- The app needs a new License Activation domain spanning onboarding UI, main-process entitlement storage, typed IPC, backend API calls, and development-build bypass behavior.
- A minimal Space Zero backend becomes required before public licensed builds can be used.
- Polar license lifecycle decisions, including beta discount/free licenses and later renewal offers, stay outside the desktop binary.
- Unsupported-version enforcement depends on the backend status endpoint, not only on updater metadata.
- Windows and Linux release/update behavior remains deferred and must not be accidentally implied by macOS v0 work.
- Users may still see the normal macOS first-open prompt for downloaded apps, but should not see unidentified-developer or cannot-check-for-malware Gatekeeper blocks.

## Alternatives Considered

- Internal/dev-only distribution — rejected because even beta users will receive public-facing builds.
- Private beta-only hidden downloads — rejected because the commercial website can be the entry point while license activation protects app usage.
- S3/R2/CDN or a custom release backend for artifacts — deferred because GitHub Releases are simpler and sufficient for v0.
- macOS, Windows, and Linux first-class auto-update from day one — rejected to keep the first public release path focused.
- Unsigned or unnotarized first beta builds — rejected because public macOS distribution should avoid Gatekeeper-blocking warnings.
- Manual local release builds — rejected because public auto-update needs a reproducible signing, notarization, publishing, and metadata path.
- Stable-only initial channel — rejected because the first public release stream is explicitly beta; stable can be added later.
- Electron's lower-level built-in `autoUpdater` — rejected because it requires more custom feed/update infrastructure than `electron-updater` with `electron-builder`.
- App calls Polar directly with embedded secrets — rejected because native clients cannot protect Polar secret API credentials.
- License activation stored only in SQLite — rejected because entitlement material should be protected with an encrypted app-data credential path.
- Read-only mode after license expiry — rejected for v0 because defining and enforcing read-only behavior across local projects, agents, tools, terminals, and workspace state would add complexity.
- Always force updates — rejected because normal updates should remain user-controlled for builder workflows.

## Review Trigger

Revisit this decision if GitHub Releases or `electron-updater` cannot support reliable public macOS updates, if signing/notarization automation becomes too brittle, if Polar's licensing model does not fit Space Zero's commercial needs, if offline usage becomes more important than expected, if customers require Windows/Linux parity, or if public release scale requires a dedicated CDN/backend artifact host.
