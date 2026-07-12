import { ipcMain } from 'electron'

import { IPC_CHANNELS } from '../../../shared/ipc'
import { getAgentUtilityProcessHost } from './agent-utility-process'

const PING_SESSION_ID = 'agent-ping'

export function registerAgentIpc(): void {
  ipcMain.handle(IPC_CHANNELS.agent.ping, () => {
    return getAgentUtilityProcessHost().ping({ sessionId: PING_SESSION_ID })
  })
}
