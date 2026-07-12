import {
  MessageChannelMain,
  type MessageEvent,
  type MessagePortMain,
  type UtilityProcess,
  utilityProcess
} from 'electron'
import log from 'electron-log/main'
import { join } from 'node:path'

import type { AgentPingRequest, AgentPingResponse, AgentUtilityFrame } from '../../../shared/agent-protocol'
import type { AgentUtilityPort } from './agent-utility-broker'
import { AgentUtilityBroker } from './agent-utility-broker'

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
      serviceName: 'spacezero-agent-utility'
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
    this.broker = new AgentUtilityBroker(mainPort)
  }

  ping(request: AgentPingRequest): Promise<AgentPingResponse> {
    this.start()

    if (!this.broker) {
      throw new Error('agent.utilityUnavailable')
    }

    return this.broker.ping(request)
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
