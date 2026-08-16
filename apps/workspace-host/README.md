# Workspace Host

This directory will contain the independently executable, headless Workspace Host.

The host will use Effect for application services, typed failures, resource scopes, concurrency, persistence, and streams. It owns authenticated client connections, the Host-local Project catalog, Pi-powered agent execution, an event-sourced Project Session domain backed by Effect 4 `@effect/sql-sqlite-node` and `better-sqlite3`, isolated project workspaces, Workspace Tools, Git operations, process supervision, and client-facing projections. It must run and be testable without Electron.

The first implementation is a separate Local Host process launched under private Node.js `22.23.1` packaged with Desktop and reached over loopback. Closing the last Desktop window leaves it running, while explicitly quitting Space Zero stops local Sessions coherently and then stops the Local Host. The host remains independently runnable and testable without Electron so the same application and protocol can support future Space Zero-managed Remote Hosts.
