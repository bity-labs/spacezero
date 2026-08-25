# ADR 0038: Package the Workspace Host as a hardened normal Node deployment

## Status

Accepted

## Context

ADR 0031 selects private Node `22.23.1` for the Local Host. Space Zero still needs to decide how the Host JavaScript, internal packages, runtime dependencies, and assets become a Desktop release resource.

A bundler could produce fewer JavaScript files, but bundling does not make third-party code trustworthy. It can obscure dependency inventory, alter dynamic imports and module resolution, complicate Pi resources, and make production stack traces and future Remote Host deployment harder to inspect.

Space Zero prefers security hardening and runtime compatibility over minimum application size. The Host must remain runnable under ordinary Node outside Electron.

## Decision

The initial Workspace Host ships as a normal production Node deployment rather than a bundled or single-executable artifact.

Conceptually:

```text
Space Zero.app/
  Contents/Resources/workspace-host/
    runtime/node
    app/
      workspace-host.mjs
      compiled internal package output
      required assets
    node_modules/
      production runtime dependencies
    integrity-manifest.json
```

Exact platform paths may vary, but the deployment contains:

- TypeScript-compiled strict ESM output;
- declared package exports for compiled internal workspace packages;
- a pruned production dependency tree created by pnpm deployment tooling;
- private Node `22.23.1` for each release architecture;
- required Pi and Host runtime assets; and
- a deterministic integrity manifest covered by platform signing.

Desktop continues using its Electron build tooling. Electron packaging includes the prepared Host deployment as signed application resources. The initial Host build does not add `tsdown`, esbuild-based Host bundling, Node SEA, Bun compilation, or another executable compiler.

### Reproducible build and supply chain

Release and CI builds:

- use the repository's pinned Node and pnpm versions;
- install from the committed lockfile with frozen-lockfile enforcement;
- permit dependency lifecycle/build scripts only through an explicit reviewed allowlist;
- compile and test before deployment;
- include production dependencies only;
- obtain the private Node runtime from an approved official distribution source;
- verify the pinned official Node archive checksum before packaging;
- produce a dependency inventory or SBOM with release artifacts; and
- never download runtimes or install dependencies when the installed app starts.

Desktop and Local Host remain one coherent, atomically signed and updated release payload.

### Deployment integrity

The integrity manifest records the expected Host entrypoint, runtime, dependency, and asset files with cryptographic hashes. The manifest itself is protected by the platform-signed application payload.

Electron main verifies the deployment manifest before launch and fails closed on missing, unexpected where policy requires enumeration, or modified protected files. This check detects corruption and post-signing resource changes; platform code signing remains the root of release authenticity.

Desktop launches the private Node executable and Host entrypoint using canonical absolute paths inside the application resources. It never resolves Host executable code from:

- the current working directory;
- a Project or Session worktree;
- Space Zero Home;
- user-global Node installations or packages;
- `NODE_PATH`; or
- runtime-downloaded code.

The signed deployment is read-only at runtime. SQLite, Pi authentication, transcripts, logs, caches, and other mutable Host data live in private operating-system application data.

### Process environment

Electron main constructs a deliberate Local Host environment instead of forwarding its complete environment unchanged.

It removes or does not supply dangerous or irrelevant injection channels, including:

- `NODE_OPTIONS`;
- `NODE_PATH`;
- `ELECTRON_RUN_AS_NODE`;
- inspect/debug argument injection;
- npm/pnpm lifecycle and configuration variables not required at runtime; and
- Desktop credentials, supervisor/client capabilities, or bootstrap secrets.

The Host receives only required platform values such as private application-data paths, `HOME`, temporary directory, locale, a deliberate executable `PATH`, and explicitly supported proxy or certificate configuration. Bootstrap material uses the protected inherited process channel from ADR 0032, never the environment or command arguments.

The Local Host starts with private application data as its working directory, not the signed application bundle, registered Project checkout, or Session worktree.

Host startup environment and the environment constructed later for a Project Session tool or terminal are separate policies. Project-specific environment data is never inherited accidentally from Desktop startup state.

### Signing and platform verification

On macOS:

- the nested private Node executable and other executable code receive appropriate signing before the outer application is signed;
- Node/V8 receives only the hardened-runtime entitlements proven necessary by packaged tests;
- application resources, including the Host deployment and integrity manifest, are sealed by the outer signature; and
- notarization, architecture, signature, runtime startup, Host handshake, and built-in `node:sqlite` are verified against packaged artifacts.

Equivalent integrity and executable-signing/install trust controls are required before Windows or Linux becomes a supported public distribution target.

### Diagnostics

Production diagnostics may report Host version, private Node version, dependency-manifest identity, integrity-check outcome, and compatibility state. They never include bearer credentials, bootstrap material, provider secrets, full inherited environments, or sensitive workspace content.

Host stdout/stderr is captured through a bounded redacting diagnostics boundary rather than copied unfiltered into renderer state or telemetry.

## Rationale

A normal Node deployment preserves the execution model under which Pi, Effect, Node built-ins, dynamic resources, and ordinary module resolution are developed and tested. It is easier to audit, debug, and reuse for a future Remote Host than a bundled Desktop-only artifact.

Security comes from a frozen dependency graph, reviewed install scripts, trusted runtime provenance, signed immutable resources, explicit integrity verification, canonical launch paths, a sanitized environment, and authenticated Host behavior—not from reducing JavaScript file count.

The additional files and package size are acceptable because Space Zero explicitly prioritizes compatibility and hardening over minimum distribution size.

## Consequences

- Release preparation needs a deterministic Host deployment step and production dependency pruning.
- Internal workspace packages require compiled outputs and declared exports.
- Release CI needs official Node checksum verification, dependency inventory/SBOM generation, integrity-manifest generation, and packaged smoke tests.
- macOS packaging must sign the nested Node executable correctly before signing/notarizing the outer app.
- The installed Host never runs `pnpm install`, downloads Node, or mutates its deployment directory.
- Production artifacts contain more files than a bundled Host and may be larger before compression.
- Future Remote Host packaging can reuse the same compiled application and production dependency model without Electron.

## Alternatives Considered

- **Bundle the Host with tsdown/esbuild immediately** — rejected because fewer files do not establish trust and bundling introduces avoidable Pi/resource/module-resolution compatibility risk.
- **Compile the Host as Node SEA** — deferred by ADR 0031 because dynamic imports, assets, and future native modules require evidence.
- **Compile the Host with Bun** — deferred because the accepted runtime is private Node and Pi/Effect compatibility is proven there first.
- **Package the entire development workspace** — rejected because dev dependencies, source tooling, tests, and unrelated files unnecessarily increase attack surface and release size.
- **Install production dependencies on first launch** — rejected because installed behavior must not depend on registries, network availability, lifecycle scripts, or mutable dependency resolution.
- **Trust filesystem location without signing or integrity verification** — rejected because the Host executes with the builder's user privileges and must fail closed on corrupted deployment resources.

## Review Trigger

Revisit this decision if:

- measurements show normal deployment materially harms startup, updates, or distribution;
- Pi and all Host assets pass deterministic bundle or SEA compatibility tests;
- Remote Host distribution requires a different artifact format;
- platform signing already provides a stronger inexpensive integrity API that can replace manifest verification without reducing assurance; or
- dependency-tree deployment cannot be made deterministic and auditable.
