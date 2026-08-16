# Desktop

This directory will contain the Electron desktop application and the first Space Zero client.

The Desktop application will own Electron lifecycle, secure preload boundaries, native operating-system integration, updates, and composition of the React client. It will install, discover, start, monitor, connect to, and coherently stop the Local Host, but it will not own Pi execution or durable Project Session behavior.

The first release packages private Node.js `22.23.1` and the Workspace Host bundle with Desktop while keeping them as separate applications and processes. Electron main establishes Local Host supervisor authority through a protected one-time bootstrap channel and gives the renderer only short-lived scoped client capabilities through preload. Public builds do not use `ELECTRON_RUN_AS_NODE` or Electron `utilityProcess` for Host execution and disable unnecessary Electron Node-mode and Node-options fuses.
