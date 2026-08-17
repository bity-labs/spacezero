# Client Runtime

Browser-safe Host client package.

It uses Effect HttpApi Client and fetch internally. UI callers receive plain Promise APIs and plain values rather than Effect runtime types.

Current APIs:

- `createLocalHostConnectionClient(...)` connects to the authenticated Host and validates the first typed SSE event.
- `createProjectCatalogClient(...)` lists Projects and registers one selected path using a generated command ID and a fresh scoped descriptor per operation.

The runtime retains neither Project paths nor capabilities after each Promise settles. Electron IPC is not used to proxy Host Project operations.

General reconnect, durable cursor catch-up, richer projections, and Project Session commands remain deferred.
