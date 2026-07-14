import { app } from 'electron'

export type WorkspaceStatus = {
  app: {
    name: string
    version: string
    platform: NodeJS.Platform
  }
  workspace: {
    status: 'ready'
  }
}

export function getWorkspaceStatus(): WorkspaceStatus {
  return {
    app: {
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform
    },
    workspace: {
      status: 'ready'
    }
  }
}
