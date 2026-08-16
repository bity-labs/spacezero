# Desktop

This directory will contain the Electron desktop application and the first Space Zero client.

The Desktop application will own Electron lifecycle, secure preload boundaries, native operating-system integration, updates, and composition of the React client. It will install, discover, start, monitor, connect to, and coherently stop the Local Host, but it will not own Pi execution or durable Project Session behavior.

The first release will package Desktop and Workspace Host together while keeping them as separate applications and processes.
