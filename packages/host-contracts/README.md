# Host Contracts

This package will define the stable, versioned protocol shared by Workspace Host clients and the host. HTTP/JSON carries commands and queries, while authenticated SSE carries ordered events; the domain contracts remain independent of those transport implementations.

It will use Effect Schema as the source for commands, queries, durable and live events, projections, structured errors, protocol compatibility metadata, and runtime validation. It must remain independent of Pi, Electron, React, Node filesystem services, and persistence implementations.
