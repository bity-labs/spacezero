# UI

This package will contain browser-safe React presentation components and their Storybook stories.

Its initial focus will be the polished agent experience: messages, streaming content, thinking, tool activity, approvals, questions, prompt input, and connection status. It must not own host communication, durable application state, Electron APIs, or Pi SDK types.

Product-specific screens and orchestration stay in the consuming application until genuine cross-client reuse is demonstrated.
