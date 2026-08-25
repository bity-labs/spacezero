# ADR 0025: Use a separate Workspace Host with a Desktop-managed Local Host lifecycle

## Status

Accepted

## Context

Space Zero v0.1 is rebuilding around a Workspace Host that owns agent execution and workspace behavior rather than placing those responsibilities in Electron main. The architecture must support remote execution later without creating separate local and remote implementations.

Process separation and process lifetime are different decisions. Remote execution requires a headless host that can run without Desktop, but the initial local product does not require agents to continue after the user quits Space Zero.

This decision promotes and refines the Workspace Host direction studied in `docs/study/v2-with-remote-access.md`. Historical v0 decisions are archived under `docs/adr/archive/v0/` and are not normative for v0.1.

## Decision

Space Zero will use a separately executable, headless **Workspace Host** as the owner of:

- Project Session execution and lifecycle;
- Pi agent runtime integration;
- Session workspace files and isolation;
- Session Git operations;
- durable Session state, events, and projections; and
- tool execution, questions, and approvals associated with a Session.

Space Zero Desktop remains an Electron client and native platform adapter. It owns Electron lifecycle, windows, secure preload APIs, native integration, updates, and Local Host process management. It does not own Project Session execution.

### Local Host

The **Local Host** is the Workspace Host deployment running on the builder's computer.

- It is a separate process from Desktop and uses the same host protocol and core host implementation intended for future Remote Hosts.
- Desktop starts, discovers, monitors, connects to, and stops it.
- Closing the last Desktop window does not quit the application; local Sessions continue while Space Zero remains running.
- Explicitly quitting Space Zero warns when local Sessions are active, stops them coherently, persists their durable state, and then stops the Local Host.
- Login startup, reboot recovery, and operation after Desktop quits are not required for the initial local implementation.

Only the Local Host and local Project Sessions are implemented initially. The product does not need a working Session Location selector until Remote Hosts are implemented.

### Future Remote Hosts

A **Remote Host** is a Space Zero-managed Workspace Host reached over the network. Customer-managed or self-hosted Workspace Host installation is not planned.

Two future Remote Host offerings are recognized:

- **On-demand Remote Host** — compute provisioned for a Project Session, billed by use, and stopped or destroyed according to an explicit retention policy.
- **Dedicated Remote Host** — persistent Space Zero-managed infrastructure assigned to a customer or workspace and capable of running multiple Project Sessions.

The infrastructure provider and provisioning technology are deliberately undecided.

### Future Remote Access

**Remote Access** is a future connection capability that allows another Space Zero client, including the Companion App, to connect securely over the network to either a Local Host or Remote Host.

Remote Access does not change a Host's type or a Session's Location. A remotely accessed Local Host remains local because execution still occurs on the builder's computer, and it is reachable only while Desktop and the Local Host are running. A Remote Host remains independent of Desktop lifecycle.

Remote Access is not part of the initial implementation. Pairing, authentication, relay, tunnel, and networking technology require later decisions. Tailscale-like approaches and the T3 companion architecture are research inputs, not selected dependencies.

A **Remote Project** keeps both its workspace and agent execution on a Remote Host. Space Zero will not run Pi locally while editing a remote filesystem through SSH or SFTP. SSH may be an infrastructure mechanism, but it is not the product workspace model.

### Future Session Location and handoff

When Remote Hosts are implemented, a new Project Session may start with a Session Location of `local` or `remote`.

A future **Session Handoff** may continue local work remotely, subject to these constraints:

- only local-to-remote handoff is planned;
- handoff starts only while the source Session has no active turn, pending tool execution, unresolved approval, or unanswered agent question; and
- the remote continuation starts from an explicit transferable checkpoint.

The checkpoint format and transfer mechanism are not decided. v0.1 must not introduce speculative migration machinery, and it must not describe handoff as migration of a live process.

## Rationale

Using one separately executable Workspace Host for both local and future remote deployments prevents two execution architectures from developing. The Local Host exercises the same process and protocol boundaries that remote execution will require while retaining the expected local behavior that explicitly quitting Space Zero stops local agent work.

Separating deployment from lifecycle also avoids prematurely installing an operating-system background service. Remote Hosts can later receive infrastructure-managed persistence without requiring the Local Host to run after Desktop quits.

Treating on-demand and dedicated infrastructure as Remote Host lifecycle variants keeps product and protocol concepts independent of a particular cloud or sandbox provider.

## Consequences

- Desktop and Workspace Host require an authenticated, versioned protocol even for local operation.
- The Local Host must be packaged, launched, monitored, and stopped independently from Electron main.
- Local shutdown needs a coherent Session stop and persistence workflow.
- Local integration tests must exercise process startup, connection, active-Session quit warnings, orderly shutdown, and reconnection after Desktop window recreation.
- Remote execution can reuse the host application and protocol, but remote authentication, provisioning, retention, networking, and billing remain later decisions.
- Remote Access to both Local and Remote Hosts remains a later feature and must not introduce initial-release networking infrastructure.
- Active local agent work does not continue after an explicit Desktop quit.
- Remote Sessions will remain independent of Desktop lifecycle when Remote Hosts are implemented.

## Alternatives Considered

- **Run local Sessions inside Electron main and use a separate host only remotely** — rejected because it creates two execution architectures and leaves remote behavior weakly exercised by the primary client.
- **Keep the Local Host running after Desktop quits** — rejected for the initial local experience; background continuation is required for Remote Hosts, not for local Sessions.
- **Install the Local Host as a login or operating-system service immediately** — rejected as premature packaging and lifecycle complexity.
- **Support customer-managed self-hosted installations** — rejected because the planned Remote Host offerings are managed by Space Zero.
- **Run Pi locally against remote files over SSH/SFTP** — rejected because agent tools, filesystem semantics, Git operations, process execution, and failure handling should stay beside the workspace.

## Review Trigger

Revisit this decision if:

- builders require local agent work to continue after explicitly quitting Desktop;
- reboot recovery becomes a local product requirement;
- customer-managed Workspace Host deployment becomes a business requirement;
- the first Remote Host implementation cannot reuse the Local Host protocol and core runtime;
- Remote Access to a Local Host requires changing the Local Host lifecycle model; or
- a concrete Session Handoff design requires revising the stated directionality or idle-state constraint.
