# Public desktop beta release workflow

Space Zero public macOS and Linux beta artifacts are produced by GitHub Actions and uploaded to Cloudflare R2 only after packaging, update metadata generation, and artifact verification succeed. macOS artifacts are also signed, notarized, and stapled before upload. Publication is additionally guarded by the `SPACEZERO_MACOS_RELEASE_PUBLISH_ENABLED=true` repository variable so the workflow can be merged and exercised without accidentally shipping an incomplete packaged runtime. Do not use ad hoc Electron Builder commands as a release process.

For certificate creation, notarization credentials, GitHub secret setup, credential handling, and rotation, see [`apple-macos-signing-and-notarization.md`](./apple-macos-signing-and-notarization.md). The local multi-architecture artifact-production target is recorded in [ADR 0021](./adr/archive/v0/0021-local-multi-architecture-macos-release-artifacts.md); the repository-owned v0 slice currently prioritizes the GitHub Actions beta path and shared verification scripts.

## Trigger and version rule

Push a beta SemVer tag whose version exactly matches both the root `package.json` and `apps/desktop/package.json`:

```bash
pnpm release:validate-tag v0.1.0-beta.1
git tag v0.1.0-beta.1
git push origin v0.1.0-beta.1
```

The workflow only listens to tags shaped like `v*-beta.*`, then runs `pnpm release:validate-tag` before packaging. Missing `v` prefixes, non-beta tags, root/Desktop package version mismatches, and tags that do not match package versions fail before publishing.

## Required repository configuration

Repository secrets must exist with these exact names:

- `CSC_LINK` — Developer ID certificate as supported by Electron Builder.
- `CSC_KEY_PASSWORD` — password for `CSC_LINK`.
- `APPLE_API_KEY_ID` — App Store Connect API key id.
- `APPLE_API_KEY_P8` — App Store Connect `.p8` private key contents.
- `APPLE_ISSUER` — App Store Connect issuer id.
- `CLOUDFLARE_R2_ACCESS_KEY_ID` — R2 token access key with write access to the release bucket.
- `CLOUDFLARE_R2_SECRET_ACCESS_KEY` — matching R2 token secret access key.

Repository variables must exist with these exact names:

- `SPACEZERO_GITHUB_CLIENT_ID`
- `SPACEZERO_GITHUB_APP_SLUG`
- `CLOUDFLARE_ACCOUNT_ID`
- `SPACEZERO_R2_BUCKET`
- `SPACEZERO_MACOS_UPDATE_BASE_URL`
- `SPACEZERO_LINUX_UPDATE_BASE_URL`

Optional repository variables:

- `SPACEZERO_R2_RELEASE_PREFIX` — root prefix inside the R2 bucket. Leave unset for bucket-root platform paths, or set to a value such as `spacezero` to publish under `spacezero/macos/...` and `spacezero/linux/...`.

Set `SPACEZERO_MACOS_RELEASE_PUBLISH_ENABLED` to `true` only when the release owner intends the final job to upload verified artifacts to the public R2 bucket. Leave it unset or any other value while validating the packaging path without publishing.

The GitHub App values are public client configuration only. Never add a GitHub App client secret, private key, Apple credential value, or certificate password to source control or release notes.

## What the workflow uploads

`.github/workflows/macos-beta-release.yml` uses deterministic `pnpm@10.28.1`, keeps setup/install/build under read-only repository permissions, and scopes release credentials only to the steps that need them. It:

1. Installs dependencies with `pnpm install --frozen-lockfile`.
2. Validates the pushed tag against both package manifests with `pnpm release:validate-tag`.
3. Prepares the public packaged GitHub App config from repository variables.
4. Runs typecheck, lint, tests, and build before any signing/notarization step.
5. Builds separate `arm64` and `x64` macOS artifacts on separate macOS runners.
6. Builds a Linux `x64` AppImage on Ubuntu.
7. Writes the App Store Connect API key to a temporary owner-only runner file inside the macOS signing/notarization step, with trap-based cleanup.
8. Runs Electron Builder for macOS with forced code signing, App Store Connect API-key notarization, and publishing disabled.
9. Explicitly notarizes and staples the signed DMG after Electron Builder creates it.
10. Runs Electron Builder for Linux AppImage packaging with publishing disabled.
11. Verifies the signed/notarized macOS DMG, ZIP, ZIP blockmap, per-architecture update metadata, and updater ZIP size/SHA-512 integrity.
12. Verifies the Linux AppImage metadata and AppImage size/SHA-512 integrity.
13. Merges the per-architecture macOS updater metadata into the final `beta-mac.yml`.
14. Re-verifies the downloaded artifact sets, writes `SHA256SUMS.txt`, and uploads the verified artifact sets to Cloudflare R2 only when publication is enabled.

R2 uploads are not attempted until packaging, update metadata generation, and artifact verification have succeeded. They are skipped entirely unless `SPACEZERO_MACOS_RELEASE_PUBLISH_ENABLED` is set to `true`.

When enabled, the upload jobs write each final artifact set to two S3-compatible prefixes:

- macOS immutable archive: `<SPACEZERO_R2_RELEASE_PREFIX>/macos/releases/<tag>/`
- macOS current beta channel: `<SPACEZERO_R2_RELEASE_PREFIX>/macos/beta/`
- Linux immutable archive: `<SPACEZERO_R2_RELEASE_PREFIX>/linux/releases/<tag>/`
- Linux current beta channel: `<SPACEZERO_R2_RELEASE_PREFIX>/linux/beta/`

`SPACEZERO_MACOS_UPDATE_BASE_URL` and `SPACEZERO_LINUX_UPDATE_BASE_URL` must be the public HTTPS URLs for the current beta channel prefixes, because Electron Builder embeds the relevant generic updater URL into each packaged app.

## Repository-owned local checks

Before pushing a real public tag, validate the release automation without creating a public release:

```bash
./scripts/run_silent "release script tests" node --test scripts/validate-release-tag.test.mjs scripts/prepare-github-app-config.test.mjs scripts/package-config.test.mjs scripts/verify-macos-release-artifacts.test.mjs scripts/verify-linux-release-artifacts.test.mjs scripts/merge-macos-update-metadata.test.mjs scripts/notarize-macos-dmg.test.mjs scripts/package-macos-ci.test.mjs scripts/package-linux-ci.test.mjs scripts/upload-r2-release-artifacts.test.mjs scripts/macos-beta-release-workflow.test.mjs
./scripts/run_silent "typecheck" pnpm typecheck
./scripts/run_silent "lint" pnpm lint
./scripts/run_silent "unit tests" pnpm test
./scripts/run_silent "build" pnpm build
```

A release owner can also validate the packaging path on a protected throwaway repository or private fork with the same secret and variable names, using a disposable beta tag that matches that repository's package manifests. Do not validate by pushing a production tag to `bity-labs/spacezero` until the release owner is ready for a public R2 upload.

## Local multi-architecture artifact production

ADR 0021 keeps a fully resumable local, non-publishing, multi-architecture artifact-production command as the target for release-owner diagnostics when Apple notarization or CI availability is unreliable. That local production command is not part of this CI-first skeleton yet; until it is ported into the repository, use the GitHub Actions workflow as the canonical public release path and do not publish locally produced artifacts as an ad hoc release.
