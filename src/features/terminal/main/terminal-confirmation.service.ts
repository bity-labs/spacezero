import * as electron from 'electron'

import { getTerminalSettings } from '../../settings/main/terminal-settings.service'

export type TerminalConfirmationPurpose = 'close-tab' | 'quit' | 'delete-context'

const terminalTerminationOperations = new Map<string, Promise<unknown>>()

export async function runWithLiveTerminalConfirmation<T>({
  operationKey,
  purpose,
  countLiveTerminals,
  run
}: {
  operationKey: string
  purpose: TerminalConfirmationPurpose
  countLiveTerminals: () => number | Promise<number>
  run: () => Promise<T>
}): Promise<T> {
  const pending = terminalTerminationOperations.get(operationKey)
  if (pending) return pending as Promise<T>

  const operation = (async () => {
    const confirmed = await shouldProceedWithLiveTerminalTermination({
      count: await countLiveTerminals(),
      purpose
    })
    if (!confirmed) throw new Error('terminal.confirmationCancelled')
    return run()
  })()
  terminalTerminationOperations.set(operationKey, operation)
  try {
    return await operation
  } finally {
    if (terminalTerminationOperations.get(operationKey) === operation) {
      terminalTerminationOperations.delete(operationKey)
    }
  }
}

export async function shouldProceedWithLiveTerminalTermination({
  count,
  purpose
}: {
  count: number
  purpose: TerminalConfirmationPurpose
}): Promise<boolean> {
  if (count <= 0) return true
  if (!Object.hasOwn(electron, 'dialog')) return true
  const dialog = (electron as { dialog?: { showMessageBox?: (options: Electron.MessageBoxOptions) => Promise<Electron.MessageBoxReturnValue> } }).dialog
  if (!dialog?.showMessageBox) return true
  const settings = await getTerminalSettings()
  if (!settings.confirmBeforeClosingLiveTerminals) return true

  const message = confirmationMessage(purpose, count)
  const result = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Cancel', confirmationButton(purpose)],
    defaultId: 0,
    cancelId: 0,
    message,
    detail: confirmationDetail(purpose, count),
    noLink: true
  })

  return result.response === 1
}

function confirmationButton(purpose: TerminalConfirmationPurpose): string {
  if (purpose === 'quit') return 'Quit and Terminate Terminals'
  if (purpose === 'delete-context') return 'Delete and Terminate Terminals'
  return 'Close Terminal'
}

function confirmationMessage(purpose: TerminalConfirmationPurpose, count: number): string {
  const terminalLabel = count === 1 ? 'live terminal' : `${count} live terminals`
  if (purpose === 'quit') return `Quit Space Zero and terminate ${terminalLabel}?`
  if (purpose === 'delete-context') return `Delete this context and terminate ${terminalLabel}?`
  return `Close this ${terminalLabel} and terminate its shell?`
}

function confirmationDetail(purpose: TerminalConfirmationPurpose, count: number): string {
  const terminalLabel = count === 1 ? 'terminal process tree' : 'terminal process trees'
  if (purpose === 'quit') {
    return `Space Zero will terminate ${count === 1 ? 'the' : 'all'} ${terminalLabel} before quitting. Terminal tabs can restore as fresh shells next time.`
  }
  if (purpose === 'delete-context') {
    return `Space Zero will terminate ${count === 1 ? 'the' : 'all'} ${terminalLabel} and remove Terminal metadata for this context.`
  }
  return 'Cancellation leaves the tab, output, and shell unchanged.'
}
