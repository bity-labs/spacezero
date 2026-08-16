# Host Contracts

This package will define the stable, versioned protocol shared by Workspace Host clients and the host using transport-safe Effect Schemas and HttpApi declarations. HTTP/JSON carries commands and queries, while authenticated typed SSE carries ordered events. Wire values remain plain interoperable HTTP/JSON/SSE, and generated OpenAPI is a derived artifact.

It will use Effect Schema as the source for commands, queries, durable and live events, projections, structured errors, protocol compatibility metadata, and runtime validation. It must remain independent of Pi, Electron, React, Node filesystem services, and persistence implementations.
