# GitHub App configuration

A release owner must create the Space Zero GitHub App. Implementation and tests do not require a real GitHub account, but a development or production build needs the App's public configuration.

## App settings

1. Create a GitHub App on GitHub.com.
2. Enable **Device Flow**.
3. Enable expiring user access tokens.
4. Allow installation on personal accounts and organizations.
5. Configure repository permissions:
   - Metadata: read (required by GitHub)
   - Contents: read and write
   - Issues: read and write
   - Pull requests: read and write
   - Workflows: read and write
   - Checks: read
   - Commit statuses: read
   - Actions: read
6. Do not grant administration, secrets, environments, members, deletion, or unrelated organization permissions.

Write access supports builder-initiated Issue comments/state changes, Pull Request comments/reviews, and future task-to-ship workflow-file changes. Space Zero does not perform automatic GitHub writes when a Session starts.

## Public client configuration

For development, set:

```bash
export SPACEZERO_GITHUB_CLIENT_ID='Iv1...'
export SPACEZERO_GITHUB_APP_SLUG='space-zero-dev'
pnpm dev
```

For a packaged build, set the same public variables before running a platform build:

```bash
SPACEZERO_GITHUB_CLIENT_ID='Iv1...' \
SPACEZERO_GITHUB_APP_SLUG='space-zero' \
pnpm build:linux # or build:mac / build:win
```

Each platform build runs `pnpm package:prepare-github` immediately before `electron-builder`. That step validates the public identifiers and writes the ignored `resources/github-app.json`; Electron Builder's `extraResources` rule copies it to `process.resourcesPath/github-app.json` before signing/packaging. A release pipeline may instead pre-create the ignored file using `resources/github-app.example.json`, but packaging fails if neither source provides both values. Never add a client secret or GitHub App private key.

Authorization alone is intentionally not a connected state. The app reports **Connected** only after a live installation query finds an accessible repository.

GitHub's pending installation-request endpoint ([`GET /app/installation-requests`](https://docs.github.com/en/rest/apps/installations#list-installation-requests-for-the-authenticated-app)) requires app authentication with a JWT and therefore the GitHub App private key. This native client deliberately has no private key, so it cannot distinguish a pending organization request from access that was never requested. It keeps the honest **Repository access required** state and offers manage and explicit recheck actions instead of inferring approval status.
