# Client Runtime

Browser-safe Host client package.

It uses Effect HttpApi Client and streaming fetch internally to acquire a fresh in-memory client descriptor, perform the authenticated connection query, decode the first typed SSE event, validate Host identity/protocol, and retry once after authorization expiry. UI callers receive plain values and errors rather than Effect runtime types.

General reconnect, durable cursor catch-up, projections, and product commands/queries remain deferred.
