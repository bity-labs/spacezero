# Apple macOS signing and notarization

This document records how Space Zero's Apple release credentials were created, where they belong, and how GitHub Actions uses them to produce trusted public macOS beta releases.

For the release procedure itself, see [`macos-beta-release.md`](./macos-beta-release.md). The architectural decision is recorded in [ADR 0018](./adr/archive/v0/0018-public-macos-beta-distribution-updates-and-license-activation.md).

## Why two Apple credentials are required

macOS signing and notarization are separate trust steps:

1. **Developer ID signing** proves that the application came from the Apple Developer team that owns the Space Zero certificate.
2. **Apple notarization** asks Apple to scan and approve the signed application so Gatekeeper can validate a downloaded public build.

Space Zero therefore uses:

- a **Developer ID Application** certificate and its private key, packaged as a password-protected `.p12`; and
- an **App Store Connect Team API key**, downloaded as a `.p8`, with its Key ID and Issuer ID.

A Developer ID Installer certificate is not used because Electron Builder produces a DMG rather than a signed macOS installer package.

## Configuration performed for Space Zero

### Developer ID Application certificate

We created a 2048-bit RSA private key and certificate signing request locally. The CSR identified the release purpose as `Space Zero Release` and was uploaded under **Apple Developer → Certificates → Developer ID Application**.

Apple issued a Developer ID Application certificate through its G2 certificate authority. After downloading the `.cer`, we verified that its public key matched the locally generated private key. The certificate and private key were then exported together as a password-protected file:

```text
SpaceZeroDeveloperID.p12
```

The `.p12` and its generated password were stored in 1Password. The raw private key, CSR, downloaded certificate, and `.p12` must never be committed to this repository.

### App Store Connect notarization key

We enabled App Store Connect API access and created a **Team Key** named `Space Zero Notarization` with the **Developer** role. We intentionally did not use an Individual API key because Apple notarization requires a Team API key.

Apple supplied:

- a one-time-download `AuthKey_<KEY_ID>.p8` private key;
- a Key ID; and
- the team's Issuer ID.

The `.p8`, Key ID, Issuer ID, role, and Apple Team ID were stored together in 1Password. Apple allows the `.p8` to be downloaded only once, so its 1Password attachment is the recovery copy.

We validated the API key without submitting an application by authenticating to Apple's notarization service:

```bash
xcrun notarytool history \
  --key /path/to/AuthKey_<KEY_ID>.p8 \
  --key-id '<KEY_ID>' \
  --issuer '<ISSUER_ID>'
```

Do not put real credential values into shell history, documentation, issue comments, or release notes.

## GitHub repository configuration

The Apple and R2 publication material is stored as GitHub Actions repository secrets with these exact names:

| Secret                            | Purpose                                                                    |
| --------------------------------- | -------------------------------------------------------------------------- |
| `CSC_LINK`                        | Base64-encoded contents of `SpaceZeroDeveloperID.p12` for Electron Builder |
| `CSC_KEY_PASSWORD`                | Password protecting the `.p12`                                             |
| `APPLE_API_KEY_P8`                | Contents of the App Store Connect `.p8` key                                |
| `APPLE_API_KEY_ID`                | App Store Connect API Key ID                                               |
| `APPLE_ISSUER`                    | App Store Connect API Issuer ID                                            |
| `CLOUDFLARE_R2_ACCESS_KEY_ID`     | R2 token access key with write access to the release bucket                |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY` | Matching R2 token secret access key                                        |

The workflow also needs these repository variables:

| Variable                                  | Purpose                                                                               |
| ----------------------------------------- | ------------------------------------------------------------------------------------- |
| `SPACEZERO_GITHUB_CLIENT_ID`              | Public GitHub App client ID embedded in the packaged app                              |
| `SPACEZERO_GITHUB_APP_SLUG`               | Public GitHub App slug embedded in the packaged app                                   |
| `CLOUDFLARE_ACCOUNT_ID`                   | Cloudflare account id for the R2 S3-compatible endpoint                               |
| `SPACEZERO_R2_BUCKET`                     | R2 bucket that stores public release downloads                                        |
| `SPACEZERO_R2_RELEASE_PREFIX`             | Optional bucket prefix before platform release paths                                  |
| `SPACEZERO_MACOS_UPDATE_BASE_URL`         | Public HTTPS URL for the macOS beta channel prefix used by Electron's generic updater |
| `SPACEZERO_LINUX_UPDATE_BASE_URL`         | Public HTTPS URL for the Linux beta channel prefix used by Electron's generic updater |
| `SPACEZERO_MACOS_RELEASE_PUBLISH_ENABLED` | Explicit `true` gate for uploading verified artifacts to R2                           |

The source values for the GitHub App variables may exist locally in the ignored `resources/github-app.json`, but a GitHub Actions runner starts from a fresh checkout and cannot read that ignored file. The repository variables provide the values to the release workflow; the publish gate must be explicitly set to `true` only when a public R2 upload should run.

List configured names without revealing their values:

```bash
gh secret list --repo bity-labs/spacezero
gh variable list --repo bity-labs/spacezero
```

GitHub never reveals a stored secret. Updating a secret replaces its value.

## How the release workflow uses the credentials

`.github/workflows/macos-beta-release.yml` separates packaging from publication:

1. A tag shaped like `v*-beta.*` starts the workflow.
2. The tag must exactly match the beta version in the root `package.json` and `apps/desktop/package.json`.
3. Dependencies are installed and the Electron application is built without write access or release credentials.
4. Only the package/sign/notarize step receives the Apple and certificate secrets.
5. `CSC_LINK` and `CSC_KEY_PASSWORD` let Electron Builder import the Developer ID identity and require code signing.
6. The workflow writes `APPLE_API_KEY_P8` to a deterministic, owner-only temporary file on the runner.
7. A shell trap removes the temporary `.p8` on success, failure, or interruption.
8. The temporary path, Key ID, and Issuer ID are exposed using the environment names expected by Electron Builder and the repository DMG notarization script.
9. Electron Builder signs and notarizes the macOS app with publishing disabled, then the repository script submits and staples the signed DMG.
10. Repository scripts verify the complete macOS DMG, ZIP, blockmap, `beta-mac.yml` artifact set, Linux AppImage metadata, and updater payload size/SHA-512 integrity.
11. Only verified artifacts move into separate R2 upload jobs with read-only repository permissions.
12. Those jobs verify the downloaded artifacts again and upload to Cloudflare R2 only when the explicit `SPACEZERO_MACOS_RELEASE_PUBLISH_ENABLED=true` repository variable is set.

This ordering prevents a partial R2 release from being published when signing, notarization, metadata generation, or artifact verification fails.

## Credential handling rules

- Keep the `.p12`, `.p8`, R2 token secrets, passwords, and raw private key out of Git, logs, screenshots, chat, issues, and release notes.
- Keep the `.p12` and `.p8` attachments in 1Password before deleting local setup copies.
- Delete the raw unencrypted private key and temporary setup directory after confirming the 1Password recovery copies.
- Never give Apple credentials to dependency-install, tag-validation, ordinary build, or publication steps.
- Do not replace pinned GitHub Action commit SHAs with mutable tags.
- Do not use an Apple ID password when the dedicated Team API key is available.
- Do not use a GitHub App private key or client secret in the desktop application.

## Rotation and recovery

### Developer ID certificate

Rotate the certificate when it is near expiry, revoked, or its private key may have been exposed:

1. Generate a new private key and CSR on a trusted Mac.
2. Create a new **Developer ID Application** certificate in Apple Developer.
3. Verify that the downloaded certificate matches the new private key.
4. Export a new password-protected `.p12` and store it in 1Password.
5. Replace `CSC_LINK` and `CSC_KEY_PASSWORD` together.
6. Run the documented safe release validation before pushing a production beta tag.
7. Revoke the old certificate only after the replacement path is confirmed.

### App Store Connect API key

Rotate the notarization key when it is revoked or may have been exposed:

1. Create a new Team API key with the least required role.
2. Download its `.p8` once and store it in 1Password immediately.
3. Replace `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`, and `APPLE_ISSUER` together.
4. Validate authentication with `xcrun notarytool history`.
5. Revoke the old key after the replacement is confirmed.

## Operational verification

Before the first public tag, run the checks documented in [`macos-beta-release.md`](./macos-beta-release.md). A real release remains the final proof that GitHub's macOS runner can import the certificate, sign the application, authenticate to Apple, complete notarization, and upload the verified artifact set to R2.

After downloading a released artifact, useful macOS checks include:

```bash
codesign --verify --deep --strict --verbose=2 '/Applications/Space Zero.app'
spctl --assess --type execute --verbose=4 '/Applications/Space Zero.app'
xcrun stapler validate '/Applications/Space Zero.app'
```

A normal first-open confirmation for an internet-downloaded app is acceptable. Gatekeeper reporting an unidentified developer or being unable to check the app for malicious software is not acceptable for a public Space Zero release.
