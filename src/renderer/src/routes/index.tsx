import { createFileRoute } from '@tanstack/react-router'

import { WorkspaceShell } from '../workspace-shell'

export const Route = createFileRoute('/')({
  component: WorkspaceShell
})
