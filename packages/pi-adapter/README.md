# Pi Adapter

This package will isolate the Workspace Host from Pi SDK implementation details.

It will expose narrow Effect services that create and restore Pi sessions, configure approved resources, subscribe to Pi events, and translate Pi promises, streams, failures, and cleanup into stable host-facing behavior. Pi SDK types and raw events must not escape into Host Contracts or client applications.
