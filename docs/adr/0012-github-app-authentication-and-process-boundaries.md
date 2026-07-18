---
title: Use a GitHub App with main-owned device authorization
---

## Status

Accepted

## Context

Space Zero needs optional GitHub.com access for repository discovery, Issues, Pull Requests, and the task-to-ship workflow. It is a native Electron client with no hosted Space Zero backend. GitHub credentials must not enter the renderer, Git remotes, logs, Pi's utility process, or project command environments.

A GitHub App can limit access to repositories selected by a builder or organization. A native client cannot safely ship a GitHub App private key or OAuth client secret. GitHub's device authorization flow is designed for clients that cannot protect a secret and supports expiring user access tokens with refresh tokens.

## Decision

Space Zero uses one GitHub.com identity at a time through a GitHub App and GitHub's device authorization flow.

- The GitHub App client ID and app slug are non-secret deployment configuration. No client secret or private key is included in the application.
- Main owns device-code requests, interval-aware polling, token refresh, installation and repository authorization checks, Octokit calls, and system-browser navigation.
- Main stores the access and refresh token together in an encrypted file under Electron's OS application-data directory. Encryption uses Electron `safeStorage`; Space Zero fails closed when protected encryption is unavailable or Linux selects the `basic_text` backend.
- Preload exposes only narrow typed operations. Renderer projections contain a device user code, verification URL, expiry, sanitized GitHub identity, installation/repository metadata, and explicit connection states. They never contain tokens or raw provider responses.
- Pi's utility process and project tools do not receive the Space Zero GitHub credential.
- Main-owned authenticated Git uses a temporary `GIT_ASKPASS` helper that answers only GitHub HTTPS credential prompts. Token-bearing Git runs with system/global Git configuration disabled, inherited Git control variables removed, non-HTTPS protocols denied, hooks disabled, and recursive submodule/maintenance work disabled. Managed clones fetch without checking out files while the token is present, then materialize files in a token-free process. Pull Request refs are fetched into an operation-owned isolated bare repository before the verified object is imported into the Project repository without a credential. The token is never placed in command arguments, clone URLs, Git config, logs, progress events, resulting remotes, project/global helpers, hooks, or filters, and temporary authentication/fetch/partial-clone files are removed.
- Authentication and repository authorization are separate. An authorized identity is shown as **Repository access required** until a current installation query finds at least one usable repository.
- Space Zero does not infer **Pending organization approval** from missing installation access. GitHub exposes pending installation requests only through [`GET /app/installation-requests`](https://docs.github.com/en/rest/apps/installations#list-installation-requests-for-the-authenticated-app). That endpoint requires app authentication with a JWT and therefore the GitHub App private key that this native client intentionally does not have. Until GitHub exposes a user-token signal or Space Zero adopts a trusted backend, an organization request remains **Repository access required** with explicit manage and recheck actions.
- Repository access is revalidated against GitHub before privileged reads or writes. Unknown, expired, revoked, suspended, SSO-restricted, or malformed states deny access.
- Device-flow errors crossing IPC are stable Space Zero error codes rather than raw GitHub payloads.
- The system browser is used for device verification and GitHub App installation/management. GitHub URLs are allow-listed before main opens them.

The GitHub App requests only the permissions described in `docs/github-app-configuration.md`. Human actions use a GitHub App user access token so GitHub attributes them to the builder and intersects the builder's rights with the installation's grants.

## Rationale

This design works without a Space Zero account or backend while preserving selected-repository authorization and Electron's trusted main-process boundary. A user access token matches the actor performing comments and reviews. `safeStorage` avoids adding a native credential dependency and keeps ciphertext in private app data, while refusing insecure Linux fallback avoids implying protection that is not present.

## Consequences

- A release owner must create and configure the GitHub App and provide its public client ID/app slug at build or deployment time.
- Builders whose OS credential backend is unavailable must configure a supported keyring before connecting GitHub.
- A local disconnect removes encrypted credentials but does not uninstall the GitHub App or mutate Projects and Git remotes.
- App installation grants remain the authorization source of truth; cached renderer data cannot grant access.
- The client cannot distinguish a pending organization request from an installation that has not been requested, so it must not present a fabricated pending state.
- GitHub Enterprise Server and multiple simultaneous GitHub identities require a later decision.

## Alternatives Considered

- **OAuth web flow with a client secret in Electron** — rejected because a native binary cannot protect the secret.
- **GitHub App installation tokens generated from a shipped private key** — rejected because the private key would be extractable and actions would not consistently represent the builder.
- **Hosted token broker** — rejected because v0 is local-first and does not require a Space Zero backend.
- **Use the builder's `gh` login** — rejected as the product integration because it may be missing, use another identity, bypass selected App grants, and expose credentials to project tools. Independently configured `gh` remains available to the builder and Pi shell tools.
- **Store tokens in SQLite or renderer storage** — rejected because it expands credential access and violates the accepted process boundary.

## Review Trigger

Revisit if GitHub changes native-app device flow, Electron changes `safeStorage`, Space Zero adds a hosted account service, GitHub Enterprise is added, or multiple identities become a product requirement.
