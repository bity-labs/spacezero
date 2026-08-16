# Client Runtime

This package will contain browser-safe client behavior shared by Desktop and future clients.

It will use Effect HttpApi Client with a fetch-based Effect HTTP Client for authenticated host connections, command dispatch, typed streaming SSE consumption, reconnection schedules, cursor-based catch-up, capability lifecycle, and client-side domain projections. Unstable HTTP types remain internal; it exposes plain framework-neutral snapshots and commands to application containers. It may depend on Host Contracts, but it must not depend on Electron, React, or Pi.
