# Workspace Host

This directory will contain the independently executable, headless Workspace Host.

The host will own authenticated client connections, Pi-powered agent execution, durable Session state, isolated project workspaces, Workspace Tools, Git operations, process supervision, and client-facing projections. It must run and be testable without Electron.

The first implementation will be local-first and loopback-only while using a protocol and lifecycle that are ready for future remote clients.
