# ADR 0021: Local multi-architecture macOS release artifacts

- Status: Accepted
- Date: 2026-08-01

## Context

ADR 0018 established GitHub Actions as the public macOS beta release path and rejected ad hoc local build-and-upload workflows. The first Developer ID release exposed two additional needs:

- Space Zero needs separately verified Apple Silicon and Intel artifacts, including native `better-sqlite3` and `node-pty` binaries.
- The app and the outer DMG distribution container must be signed, notarized, stapled, and independently verified before publication.

A release owner also needs a deterministic local way to validate the complete artifact-production path when Apple's notarization queue exceeds a CI timeout.

## Decision

Space Zero provides one local artifact-production command:

```bash
pnpm release:macos:local
```

The command runs a sequential pipeline for `arm64` and then `x64`. For each architecture it:

1. packages and Developer ID signs the app;
2. verifies the app and packaged native-module architecture;
3. submits the app to Apple, staples it, and verifies Gatekeeper acceptance;
4. creates the updater ZIP and a securely timestamped Developer ID signed DMG;
5. submits the DMG to Apple, staples it, and verifies the disk image and Gatekeeper acceptance.

After both architectures pass, the command generates fresh blockmaps, shared `beta-mac.yml`, and checksums from the final stapled bytes. It mounts both DMGs and verifies their contained apps.

The command has no publishing capability. Publication remains a separate explicit release-owner action.

## Consequences

- Four Apple notarization submissions are expected: app and DMG for each architecture.
- Apple submission IDs and output are retained in per-run logs. If a submission does not reach `Accepted`, the run stops and preserves its payload; the release owner must inspect that submission rather than blindly resubmit.
- Signing credentials remain outside the repository. The `.p12` password and Issuer UUID are prompted locally, and the certificate is imported into a temporary keychain removed on exit.
- The final updater metadata contains both architectures in one `beta-mac.yml`; ARM artifact names contain `arm64` because `electron-updater` uses that URL marker when selecting a macOS update.
- A real Intel Mac or Intel CI runner remains the strongest final runtime validation for x64. Rosetta and Mach-O validation provide local coverage on Apple Silicon.

## Supersedes

This ADR narrows ADR 0018's rejection of local releases: ad hoc local build-and-upload remains rejected, while disciplined local production of verified, non-published artifacts is accepted.
