# Scripts

This directory contains small repository and release automation scripts. They should remain deterministic, documented, and suitable for local and CI execution.

Current release helpers:

- `validate-release-tag.mjs` — validates beta tag shape and root/Desktop package version consistency before packaging.
- `prepare-github-app-config.mjs` — writes ignored packaged public GitHub App config from environment variables without echoing values.
- `verify-macos-release-artifacts.mjs` — checks macOS DMG/ZIP/blockmap/updater metadata shape, updater size/SHA-512 integrity, and can require macOS trust checks in CI.
- `verify-linux-release-artifacts.mjs` — checks Linux AppImage/updater metadata shape and updater AppImage size/SHA-512 integrity.
- `notarize-macos-dmg.mjs` — submits the signed DMG to Apple notarization and staples it using the temporary App Store Connect API-key file prepared by CI.
- `package-macos-ci.mjs` — invokes Electron Builder for exactly one requested macOS architecture from CI.
- `package-linux-ci.mjs` — invokes Electron Builder for the Linux x64 AppImage release target from CI.
- `merge-macos-update-metadata.mjs` — merges per-architecture Electron Builder updater manifests into the final `beta-mac.yml`.
- `upload-r2-release-artifacts.mjs` — uploads the verified macOS artifact set to immutable and current Cloudflare R2 prefixes using S3-compatible credentials.

Likely future responsibilities include packaged application smoke tests, artifact and Electron-fuse verification, Workspace Host health checks, and local release-owner artifact production.
