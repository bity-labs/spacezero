# Pi Adapter

This package will isolate the Workspace Host from Pi SDK implementation details.

It will create and restore Pi sessions, configure approved resources, subscribe to Pi events, and translate Pi behavior into a narrow host-facing interface. Pi SDK types and raw events must not escape into Host Contracts or client applications.
