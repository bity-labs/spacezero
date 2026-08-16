# Client Runtime

This package will contain browser-safe client behavior shared by Desktop and future clients.

It will own authenticated host connections, command dispatch, event subscriptions, reconnection, cursor-based catch-up, and client-side domain projections. It may depend on Host Contracts, but it must not depend on Electron or Pi.
