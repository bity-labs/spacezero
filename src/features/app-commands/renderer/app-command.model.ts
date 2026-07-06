import type { SpaceZeroAPI } from '@shared/ipc'

export type AppCommandId = string

export type AppCommandCategory = string

export type AppCommandInvocationContext = {
  /**
   * Narrow preload API for commands that must cross into privileged or persisted app behavior.
   * Renderer-local UI commands should handle their behavior locally instead of crossing IPC unnecessarily.
   */
  spacezero: SpaceZeroAPI
}

export type AppCommandHandler = (context: AppCommandInvocationContext) => void | Promise<void>

export type AppCommand = {
  id: AppCommandId
  title: string
  category: AppCommandCategory
  keywords?: readonly string[]
  handler: AppCommandHandler
}
