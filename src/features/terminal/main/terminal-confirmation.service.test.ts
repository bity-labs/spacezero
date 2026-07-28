import { beforeEach, describe, expect, it, vi } from 'vitest'

async function loadConfirmationService({
  enabled = true,
  response = 1
}: {
  enabled?: boolean
  response?: number
} = {}) {
  vi.resetModules()
  const showMessageBox = vi.fn(async () => ({ response }))
  vi.doMock('electron', () => ({ dialog: { showMessageBox } }))
  vi.doMock('../../settings/main/terminal-settings.service', () => ({
    getTerminalSettings: vi.fn(async () => ({ confirmBeforeClosingLiveTerminals: enabled }))
  }))
  const service = await import('./terminal-confirmation.service')
  return { ...service, showMessageBox }
}

describe('terminal native confirmation service', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uses aggregate quit wording and treats Cancel as denial', async () => {
    const { shouldProceedWithLiveTerminalTermination, showMessageBox } = await loadConfirmationService({
      response: 0
    })

    await expect(
      shouldProceedWithLiveTerminalTermination({ count: 2, purpose: 'quit' })
    ).resolves.toBe(false)

    expect(showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        buttons: ['Cancel', 'Quit and Terminate Terminals'],
        defaultId: 0,
        cancelId: 0,
        message: 'Quit Space Zero and terminate 2 live terminals?',
        detail: expect.stringContaining('all terminal process trees')
      })
    )
  })

  it('uses archive wording for archived contexts with live terminals', async () => {
    const { shouldProceedWithLiveTerminalTermination, showMessageBox } = await loadConfirmationService()

    await expect(
      shouldProceedWithLiveTerminalTermination({ count: 1, purpose: 'archive-context' })
    ).resolves.toBe(true)

    expect(showMessageBox).toHaveBeenCalledWith(
      expect.objectContaining({
        buttons: ['Cancel', 'Archive and Terminate Terminals'],
        message: 'Archive this context and terminate live terminal?',
        detail: expect.stringContaining('archive this context')
      })
    )
  })

  it('skips the native dialog when the persisted preference disables confirmation', async () => {
    const { shouldProceedWithLiveTerminalTermination, showMessageBox } = await loadConfirmationService({
      enabled: false
    })

    await expect(
      shouldProceedWithLiveTerminalTermination({ count: 1, purpose: 'delete-context' })
    ).resolves.toBe(true)

    expect(showMessageBox).not.toHaveBeenCalled()
  })

  it('coalesces concurrent requests for the same operation into one confirmation and cleanup', async () => {
    const { runWithLiveTerminalConfirmation, showMessageBox } = await loadConfirmationService()
    const run = vi.fn(async () => 'deleted')

    await expect(
      Promise.all([
        runWithLiveTerminalConfirmation({
          operationKey: 'delete-session:session-1',
          purpose: 'delete-context',
          countLiveTerminals: () => 3,
          run
        }),
        runWithLiveTerminalConfirmation({
          operationKey: 'delete-session:session-1',
          purpose: 'delete-context',
          countLiveTerminals: () => 3,
          run
        })
      ])
    ).resolves.toEqual(['deleted', 'deleted'])

    expect(showMessageBox).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('coalesces cancellation and does not run cleanup', async () => {
    const { runWithLiveTerminalConfirmation, showMessageBox } = await loadConfirmationService({
      response: 0
    })
    const run = vi.fn(async () => 'deleted')

    await expect(
      Promise.all([
        runWithLiveTerminalConfirmation({
          operationKey: 'reset-knowledge-base',
          purpose: 'delete-context',
          countLiveTerminals: () => 1,
          run
        }),
        runWithLiveTerminalConfirmation({
          operationKey: 'reset-knowledge-base',
          purpose: 'delete-context',
          countLiveTerminals: () => 1,
          run
        })
      ])
    ).rejects.toThrow('terminal.confirmationCancelled')

    expect(showMessageBox).toHaveBeenCalledTimes(1)
    expect(run).not.toHaveBeenCalled()
  })
})
