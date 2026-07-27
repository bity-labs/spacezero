# Public macOS beta release workflow

Space Zero public macOS beta artifacts are published by GitHub Actions from version tags. Do not run the first public release by building and uploading artifacts from a local machine.

## Trigger and version rule

Push a beta SemVer tag whose version exactly matches `package.json`:

```bash
pnpm release:validate-tag v0.1.0-beta.1
git tag v0.1.0-beta.1
git push origin v0.1.0-beta.1
```

The workflow only listens to tags shaped like `v*-beta.*`, then runs `pnpm release:validate-tag` before packaging. Missing `v` prefixes, non-beta tags, and tags that do not match `package.json` fail before publishing.

## Required repository configuration

Repository secrets must exist with these exact names:

- `CSC_LINK` — Developer ID certificate as supported by Electron Builder.
- `CSC_KEY_PASSWORD` — password for `CSC_LINK`.
- `APPLE_API_KEY_ID` — App Store Connect API key id.
- `APPLE_API_KEY_P8` — App Store Connect `.p8` private key contents.
- `APPLE_ISSUER` — App Store Connect issuer id.

Repository variables must exist with these exact names:

- `SPACEZERO_GITHUB_CLIENT_ID`
- `SPACEZERO_GITHUB_APP_SLUG`

The GitHub App values are public client configuration only. Never add a GitHub App client secret, private key, Apple credential value, or certificate password to source control or release notes.

## What the workflow publishes

`.github/workflows/macos-beta-release.yml` runs on `macos-latest` with least required repository permission (`contents: write`). It:

1. Installs dependencies with `pnpm install --frozen-lockfile`.
2. Validates the pushed tag against `package.json` with `pnpm release:validate-tag`.
3. Prepares the public packaged GitHub App config from repository variables.
4. Builds the Electron main and renderer bundles.
5. Writes the App Store Connect API key to a temporary runner file with owner-only permissions.
6. Runs Electron Builder for macOS with forced code signing and `--publish always`.
7. Removes the temporary App Store Connect API key file in an `always()` cleanup step.

Electron Builder uses the existing macOS beta channel config to produce the signed/notarized DMG plus updater ZIP/blockmap/metadata artifacts required by `electron-updater`, and publishes them to the GitHub Release only after signing/notarization succeeds.

## Safe validation before the first public beta

Before pushing a real public tag, validate without creating a public release:

```bash
./scripts/run_silent "release tag validation" pnpm release:validate-tag v0.1.0-beta.1
./scripts/run_silent "workflow tests" pnpm exec vitest run scripts/macos-beta-release-workflow.test.ts scripts/package-config.test.ts scripts/validate-release-tag.test.ts
./scripts/run_silent "typecheck" pnpm typecheck
./scripts/run_silent "lint" pnpm lint
./scripts/run_silent "unit tests" pnpm test
./scripts/run_silent "build" pnpm build
```

A release owner can also validate the packaging path on a protected throwaway repository or private fork with the same secret and variable names, using a disposable beta tag that matches that repository's `package.json`. Do not validate by pushing a production tag to `bity-labs/spacezero` until the release owner is ready for a public GitHub Release.
