# Client Runtime

This package will contain browser-safe client behavior shared by Desktop and future clients.

It will use Effect internally for authenticated host connections, command dispatch, streaming SSE consumption, reconnection schedules, cursor-based catch-up, capability lifecycle, and client-side domain projections. It exposes plain framework-neutral snapshots and commands to application containers. It may depend on Host Contracts, but it must not depend on Electron, React, or Pi.
