import {
  app,
  BrowserWindow,
  MessageChannelMain,
  type MessageEvent,
  type MessagePortMain,
  type UtilityProcess,
  utilityProcess
} from 'electron'
import log from 'electron-log/main'
import { join } from 'node:path'

import type {
  AgentPingRequest,
  AgentPingResponse,
  AgentSessionState,
  AgentUtilityFrame,
  CreateAgentSessionRequest,
  DeleteAgentSessionRequest,
  GetAgentSessionStateRequest
} from '../../../shared/agent-protocol'
import { IPC_CHANNELS } from '../../../shared/ipc'
import type { AgentToolExecutionEvent } from '../../../shared/workspace-tool-protocol'
import type { AgentUtilityPort } from './agent-utility-broker'
import { AgentUtilityBroker } from './agent-utility-broker'
import { getWorkspaceToolExecutor } from './workspace-tool-control-plane'

class MessagePortMainAgentUtilityPort implements AgentUtilityPort {
  constructor(private readonly port: MessagePortMain) {}

  postMessage(frame: AgentUtilityFrame): void {
    this.port.postMessage(frame)
  }

  onMessage(handler: (frame: AgentUtilityFrame) => void): void {
    this.port.on('message', (event: MessageEvent) => {
      handler(event.data as AgentUtilityFrame)
    })
    this.port.start()
  }

  onClose(handler: () => void): void {
    this.port.on('close', handler)
  }

  close(): void {
    this.port.close()
  }
}

export class AgentUtilityProcessHost {
  private utility: UtilityProcess | undefined
  private mainPort: MessagePortMainAgentUtilityPort | undefined
  private broker: AgentUtilityBroker | undefined
  private stopping = false

  start(): void {
    if (this.utility) return

    this.stopping = false
    const utility = utilityProcess.fork(join(__dirname, 'agent-utility.js'), [], {
      serviceName: 'spacezero-agent-utility',
      env: {
        ...process.env,
        SPACEZERO_AGENT_DIR: join(app.getPath('userData'), 'agent')
      }
    })
    const { port1, port2 } = new MessageChannelMain()
    const mainPort = new MessagePortMainAgentUtilityPort(port1)

    utility.once('exit', (code) => {
      if (this.stopping) {
        log.debug(`Agent utility process stopped with code ${code}`)
      } else {
        log.warn(`Agent utility process exited with code ${code}`)
      }

      this.broker?.dispose(new Error(`agent.utilityExited:${code ?? 'unknown'}`))
      this.mainPort?.close()
      this.utility = undefined
      this.broker = undefined
      this.mainPort = undefined
      this.stopping = false
    })

    utility.postMessage({ type: 'spacezero.agent.connect' }, [port2])

    this.utility = utility
    this.mainPort = mainPort
    this.broker = new AgentUtilityBroker(mainPort, {
      onEvent: (event) => {
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send(IPC_CHANNELS.agent.event, event)
        }
      },
      executeWorkspaceTool: async (request) => {
        this.sendToolExecution({
          sessionId: request.sessionId,
          callId: request.callId,
          toolName: request.toolName,
          state: 'running',
          input: request.input
        })

        const result = await getWorkspaceToolExecutor().execute(request.toolName, request.input)
        this.sendToolExecution({
          sessionId: request.sessionId,
          callId: request.callId,
          toolName: request.toolName,
          state: result.ok ? 'success' : 'error',
          input: request.input,
          output: result,
          error: result.ok ? undefined : result.error.message
        })
        return result
      }
    })
  }

  ping(request: AgentPingRequest): Promise<AgentPingResponse> {
    return this.getBroker().ping(request)
  }

  createSession(request: CreateAgentSessionRequest): Promise<AgentSessionState> {
    return this.getBroker().createSession(request)
  }

  deleteSession(request: DeleteAgentSessionRequest): Promise<void> {
    return this.getBroker().deleteSession(request)
  }

  getState(request: GetAgentSessionStateRequest): Promise<AgentSessionState> {
    return this.getBroker().getState(request)
  }

  listSessions(): Promise<AgentSessionState[]> {
    return this.getBroker().listSessions()
  }

  private sendToolExecution(event: AgentToolExecutionEvent): void {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.agent.toolExecution, event)
    }
  }

  private getBroker(): AgentUtilityBroker {
    this.start()

    if (!this.broker) {
      throw new Error('agent.utilityUnavailable')
    }

    return this.broker
  }

  stop(): void {
    this.stopping = this.utility !== undefined
    this.broker?.dispose(new Error('agent.utilityStopped'))
    this.mainPort?.close()
    this.utility?.kill()
    this.mainPort = undefined
    this.broker = undefined
    this.utility = undefined
  }
}

let host: AgentUtilityProcessHost | undefined

export function getAgentUtilityProcessHost(): AgentUtilityProcessHost {
  host ??= new AgentUtilityProcessHost()
  return host
}

export function stopAgentUtilityProcessHost(): void {
  host?.stop()
  host = undefined
}
