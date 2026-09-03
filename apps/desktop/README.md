# Desktop

Active Electron + React client for the authenticated Local Host connectivity tracer.

It creates a secure `BrowserWindow`, serves built assets from the standard secure `spacezero://renderer` origin, launches the ordinary-Node Local Host through protected inherited pipes, retains supervisor authority in Electron main, restarts unexpected Local Host crashes with bounded backoff, and exposes only app-version and client-capability issuance through preload. The renderer reaches the Host directly through Client Runtime HTTP/SSE. Development accepts only validated loopback renderer URLs.

The checked-in `electron-builder.yml` now contains the macOS and Linux beta Electron Builder target shapes used by the repository release scripts and GitHub Actions workflow. It emits separate macOS DMG/ZIP updater artifacts for `arm64` and `x64`, emits a Linux x64 AppImage, expects Developer ID signing plus App Store Connect API-key notarization for macOS in CI, embeds the configured Cloudflare R2 generic updater URL for each platform build, and packages only the public GitHub App config from `resources/github-app.json`. Public R2 uploads remain guarded by an explicit repository variable until the packaged runtime is ready to ship.

Packaged Host launch remains fail-closed until private Node and integrity verification are available. Deferred: in-app update UI/install controls, broader packaging hardening, fuses validation, full private-Node Host payload verification, routing, product UI, Tailwind/shadcn, and broad mock-Host scenarios.
