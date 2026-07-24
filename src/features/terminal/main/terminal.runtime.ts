import { BrowserWindow } from 'electron'

import { createSessionsRepository } from '../../sessions/main/sessions.repository'
import { getManagedWorktreeService } from '../../sessions/main/managed-worktree.runtime'
import { TERMINAL_IPC_CHANNELS } from '../shared'
import { createNodePtyAdapter } from './node-pty.adapter'
import { createTerminalService } from './terminal.service'

let terminalService: ReturnType<typeof createTerminalService> | undefined

export function getTerminalService(): ReturnType<typeof createTerminalService> {
  terminalService ??= createTerminalService({
    repository: createSessionsRepository(),
    worktrees: getManagedWorktreeService(),
    pty: createNodePtyAdapter(),
    emitToWindow(windowId, event) {
      BrowserWindow.fromId(windowId)?.webContents.send(TERMINAL_IPC_CHANNELS.event, event)
    }
  })
  return terminalService
}
