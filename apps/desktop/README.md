# Desktop

Minimal active Electron + React shell for the initialization slice.

It currently creates one secure `BrowserWindow`, loads only the trusted renderer source for the current environment, and exposes one narrow typed preload method: `window.spacezero.getAppVersion()`. Production ignores `ELECTRON_RENDERER_URL`; development accepts only a validated loopback dev URL.

The checked-in `electron-builder.yml` is foundation-only configuration; packaging commands, Host packaging, fuses/signing validation, and release validation are deferred.

Deferred: Local Host supervision, bootstrap/capability delivery, native dialogs, updates, packaging hardening, fuses/signing validation, routing, product UI, Tailwind/shadcn, and mock/real Host integration scenarios.
