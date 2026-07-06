import { AppCommand, AppCommandId } from './app-command.model'

export type { AppCommand, AppCommandId } from './app-command.model'

/**
 * In-memory catalog of App Commands.
 *
 * The registry does not own command behavior; it only maps stable command IDs
 * to their handlers. Commands are registered by the code that owns the state
 * they mutate (for example, the workspace shell registers sidebar toggles).
 */
export class AppCommandRegistry {
  private readonly commands = new Map<AppCommandId, AppCommand>()

  /**
   * Register a command. Returns an unsubscribe function that removes the
   * registration. Re-registering the same ID overwrites the previous entry.
   */
  register(command: AppCommand): () => void {
    this.commands.set(command.id, command)
    return () => {
      this.commands.delete(command.id)
    }
  }

  get(id: AppCommandId): AppCommand | undefined {
    return this.commands.get(id)
  }

  getAll(): AppCommand[] {
    return Array.from(this.commands.values())
  }

  /** Execute a registered command by ID. Returns true if the ID was known. */
  execute(id: AppCommandId): boolean {
    const command = this.commands.get(id)
    if (!command) {
      return false
    }
    command.handler()
    return true
  }
}

/** Global renderer registry used by the shortcut manager and UI surfaces. */
export const appCommandRegistry = new AppCommandRegistry()
