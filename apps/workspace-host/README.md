# Workspace Host

This directory will contain the independently executable, headless Workspace Host.

The host will use Effect for application services, typed failures, resource scopes, concurrency, persistence, and streams. It owns authenticated client connections, Pi-powered agent execution, an SQLite-backed event-sourced Project Session domain, isolated project workspaces, Workspace Tools, Git operations, process supervision, and client-facing projections. It must run and be testable without Electron.

The first implementation is a separate Local Host process managed by Desktop and reached over loopback. Closing the last Desktop window leaves it running, while explicitly quitting Space Zero stops local Sessions coherently and then stops the Local Host. The host remains independently runnable and testable without Electron so the same application and protocol can support future Space Zero-managed Remote Hosts.
