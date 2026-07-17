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

For a packaged build, provide `github-app.json` next to packaged resources using the shape in `resources/github-app.example.json`. The client ID and slug are public identifiers. Never add a client secret or GitHub App private key.

Authorization alone is intentionally not a connected state. The app reports **Connected** only after a live installation query finds an accessible repository.
