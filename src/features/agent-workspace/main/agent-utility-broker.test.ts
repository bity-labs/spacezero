import type { AgentUtilityFrame } from '../../../shared/agent-protocol'
import { AgentUtilityBroker, type AgentUtilityPort } from './agent-utility-broker'

class FakeAgentUtilityPort implements AgentUtilityPort {
  postedFrames: AgentUtilityFrame[] = []
  private messageHandler: ((frame: AgentUtilityFrame) => void) | undefined
  private closeHandler: (() => void) | undefined

  postMessage(frame: AgentUtilityFrame): void {
    this.postedFrames.push(frame)
  }

  onMessage(handler: (frame: AgentUtilityFrame) => void): void {
    this.messageHandler = handler
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler
  }

  emit(frame: AgentUtilityFrame): void {
    this.messageHandler?.(frame)
  }

  close(): void {
    this.closeHandler?.()
  }
}

describe('AgentUtilityBroker', () => {
  it('round-trips a session-tagged ping command through the utility port', async () => {
    const port = new FakeAgentUtilityPort()
    const broker = new AgentUtilityBroker(port, { createRequestId: () => 'request-1' })

    const pingPromise = broker.ping({ sessionId: 'session-1' })

    expect(port.postedFrames).toEqual([
      {
        type: 'agent.command',
        requestId: 'request-1',
        command: 'agent.ping',
        sessionId: 'session-1'
      }
    ])

    port.emit({
      type: 'agent.response',
      requestId: 'request-1',
      ok: true,
      sessionId: 'session-1',
      result: {
        sessionId: 'session-1',
        message: 'pong-from-agent-utility',
        utilityProcessId: 1234
      }
    })

    await expect(pingPromise).resolves.toEqual({
      sessionId: 'session-1',
      message: 'pong-from-agent-utility',
      utilityProcessId: 1234
    })
  })

  it('rejects a pending command when the utility reports a failure', async () => {
    const port = new FakeAgentUtilityPort()
    const broker = new AgentUtilityBroker(port, { createRequestId: () => 'request-1' })

    const pingPromise = broker.ping({ sessionId: 'session-1' })

    port.emit({
      type: 'agent.response',
      requestId: 'request-1',
      ok: false,
      sessionId: 'session-1',
      error: {
        code: 'agent.unknownCommand',
        message: 'Unknown command'
      }
    })

    await expect(pingPromise).rejects.toThrow('Unknown command')
  })

  it('rejects pending commands when the broker is disposed', async () => {
    const port = new FakeAgentUtilityPort()
    const broker = new AgentUtilityBroker(port, { createRequestId: () => 'request-1' })

    const pingPromise = broker.ping({ sessionId: 'session-1' })

    broker.dispose(new Error('agent.utilityExited:1'))

    await expect(pingPromise).rejects.toThrow('agent.utilityExited:1')
  })

  it('rejects pending commands when the utility port closes', async () => {
    const port = new FakeAgentUtilityPort()
    const broker = new AgentUtilityBroker(port, { createRequestId: () => 'request-1' })

    const pingPromise = broker.ping({ sessionId: 'session-1' })

    port.close()

    await expect(pingPromise).rejects.toThrow('agent.utilityPortClosed')
  })

  it('rejects pending commands when the utility does not answer before the timeout', async () => {
    vi.useFakeTimers()

    try {
      const port = new FakeAgentUtilityPort()
      const broker = new AgentUtilityBroker(port, {
        createRequestId: () => 'request-1',
        requestTimeoutMs: 50
      })

      const pingPromise = broker.ping({ sessionId: 'session-1' })

      vi.advanceTimersByTime(50)

      await expect(pingPromise).rejects.toThrow('agent.utilityRequestTimedOut')
    } finally {
      vi.useRealTimers()
    }
  })
})
