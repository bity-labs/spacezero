# Desktop

Active Electron + React client for the authenticated Local Host connectivity tracer.

It creates a secure `BrowserWindow`, serves built assets from the standard secure `spacezero://renderer` origin, launches the ordinary-Node Local Host through protected inherited pipes, retains supervisor authority in Electron main, restarts unexpected Local Host crashes with bounded backoff, and exposes only app-version and client-capability issuance through preload. The renderer reaches the Host directly through Client Runtime HTTP/SSE. Development accepts only validated loopback renderer URLs.

The checked-in `electron-builder.yml` is foundation-only configuration; packaging commands, Host packaging, fuses/signing validation, and release validation are deferred.

Packaged Host launch remains fail-closed until private Node and integrity verification are available. Deferred: native dialogs, updates, packaging hardening, fuses/signing validation, routing, product UI, Tailwind/shadcn, and broad mock-Host scenarios.
