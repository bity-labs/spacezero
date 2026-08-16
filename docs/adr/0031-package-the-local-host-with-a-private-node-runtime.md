# ADR 0031: Package the Local Host with a private Node runtime

## Status

Accepted

## Context

The Local Host is a separate process managed by Space Zero Desktop. Development and future Remote Host deployments can run the Workspace Host bundle with Node, but the installed Desktop application cannot assume that the builder has a compatible system Node installation.

Electron can execute JavaScript in Node mode through `ELECTRON_RUN_AS_NODE`, and applications such as T3 Code use that mechanism for a bundled server. However, using it requires keeping Electron's `RunAsNode` capability enabled. Electron identifies that capability as a possible living-off-the-land attack surface and recommends disabling unused powerful fuses.

OpenCode is exploring a standalone compiled Bun CLI, but Space Zero has not established that Pi, Effect, SQLite, dynamic resources, and packaging are safe under Bun or a single-executable compiler. Node SEA introduces similar compatibility uncertainty before the initial Host works.

## Decision

Space Zero Desktop will package a private, pinned Node runtime and use it to launch the Workspace Host JavaScript bundle as a separate child process.

Conceptually:

```text
Space Zero.app
  Contents/Resources/workspace-host/
    runtime/node
    app/workspace-host.mjs
    app/assets and required Node dependencies
```

Exact resource paths may vary by platform, but the runtime and Host bundle remain outside renderer authority and are treated as a versioned signed payload.

The same Workspace Host application bundle must run and be testable with ordinary Node outside Electron. Future Remote Hosts use the supported Node runtime line without depending on Electron.

### Security boundary

Public Desktop builds disable Electron capabilities that are unnecessary with the private Host runtime, including where supported:

- `RunAsNode`;
- `EnableNodeOptionsEnvironmentVariable`; and
- `EnableNodeCliInspectArguments`.

Public builds also enable applicable ASAR integrity and app-loading hardening after packaged validation.

Desktop does not launch the Host through `ELECTRON_RUN_AS_NODE` or Electron `utilityProcess`. The private Node process does not receive raw Desktop credentials, renderer state, Electron APIs, or unnecessary Desktop environment variables.

Desktop passes one-time bootstrap material over an inherited pipe/file descriptor or equivalently protected process channel. Bootstrap credentials never appear in command-line arguments, URLs, logs, or persistent renderer storage.

The Host binds to loopback initially, authenticates every privileged operation, and exchanges bootstrap material for the Host-lifetime supervisor capability defined by ADR 0032.

### Runtime and native modules

The initial supported runtime is Node.js 22 LTS, pinned to `22.23.1` for the implementation baseline. Repository tooling, CI, local development guidance, the packaged private runtime, and future initial Remote Host compatibility target that same version. The packaged runtime version is part of Host diagnostics and compatibility metadata.

Node patch or major upgrades are dedicated dependency changes with Pi, Effect, SQLite/native-module, protocol, restart-recovery, and packaged Host validation.

The initial SQLite adapter uses Node `22.23.1`'s built-in `node:sqlite`, so it requires no separate native module or ABI rebuild. Any future Host-native modules build for the private runtime's normal Node ABI rather than Electron's ABI. Electron main and renderer never load Host-native modules.

The private Node runtime, Host bundle, native modules, and required assets must be included in signing, notarization, architecture, and packaged smoke verification.

### Lifecycle and updates

Desktop starts, monitors, and stops the private Node Host according to ADR 0025. Closing the last window leaves Desktop and the Local Host running; explicit Desktop quit stops local Sessions coherently and then terminates the Host.

Desktop and its bundled Local Host payload update together. Because the Local Host stops on explicit Desktop quit, an applied Desktop update starts the corresponding Host payload on the next launch. Protocol compatibility is still checked before privileged operations, and an incompatible or unhealthy Host prevents Session startup rather than falling back to Electron-owned behavior.

Host data remains outside the application bundle in private operating-system application data. Updating or replacing the signed application never treats the bundled resources directory as durable storage.

### No initial single-executable compilation

Node SEA, Bun compilation, and another standalone compiler are deferred. They may be evaluated later through packaged compatibility tests, but the private Node runtime is the accepted fallback and initial production approach.

## Rationale

A private Node runtime gives the Local Host a normal, pinned Node environment without relying on a user's machine or keeping Electron's general Node execution mode enabled. It preserves the separate-process and independently testable Host boundary while minimizing compatibility risk for Pi, Effect, SQLite, and dynamic resources.

The additional application size and signing work are preferable to two runtime architectures or weakening Electron fuse hardening. Using the normal Node ABI also aligns local and future Remote Host dependencies.

## Consequences

- Desktop artifacts are larger because they contain Electron and a private Node 22 runtime.
- Repository tooling and CI must reject unsupported Node versions rather than silently producing mismatched Host or native artifacts.
- Release packaging must sign, notarize, architecture-check, and smoke-test the nested runtime and Host payload.
- Host startup must use a sanitized environment and protected bootstrap channel.
- Native modules require only the pinned Node ABI for Host execution, while any unrelated Electron-native modules remain separate.
- Desktop updates and Host compatibility require packaged integration tests.
- Public builds can disable Electron Node-mode and Node-options fuses.
- Remote Host distribution remains a later packaging decision but can reuse the Host bundle and Node support policy.

## Alternatives Considered

- **Use `ELECTRON_RUN_AS_NODE` like T3 Code** — rejected because it requires retaining a powerful Electron execution mode and couples packaged Host runtime/ABI to Electron.
- **Use Electron `utilityProcess.fork()`** — rejected because it makes the Local Host an Electron-specific runtime rather than the independently testable Host application accepted in ADR 0025.
- **Require a system Node installation** — rejected because installed Desktop behavior must not depend on user-managed runtime availability or version.
- **Compile a Bun executable like OpenCode's developing V2 path** — deferred because Pi and the selected Host stack have not been qualified under Bun.
- **Compile a Node SEA executable immediately** — deferred because native modules, dynamic imports, Pi resources, and assets require evidence before replacing the simpler private runtime.

## Review Trigger

Revisit this decision if:

- packaged size materially harms distribution or updates;
- Node SEA or another dedicated executable passes Pi, Effect, SQLite, asset, signing, and update smoke tests with lower operational risk;
- Node 22 approaches end of support or cannot satisfy Pi SDK requirements;
- the private runtime cannot be signed or notarized reliably on a supported platform; or
- future Remote Host distribution benefits from one executable enough to justify a shared compilation strategy.
