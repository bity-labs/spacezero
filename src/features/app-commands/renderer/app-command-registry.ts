import type { AppCommand, AppCommandId } from './app-command.model'

export type UnregisterAppCommand = () => void
export type AppCommandRegistryListener = () => void

export class AppCommandRegistry {
  private readonly commands = new Map<AppCommandId, AppCommand>()
  private readonly listeners = new Set<AppCommandRegistryListener>()
  private version = 0

  register(command: AppCommand): UnregisterAppCommand {
    if (this.commands.has(command.id)) {
      throw new Error(`App command already registered: ${command.id}`)
    }

    this.commands.set(command.id, command)
    this.notifyListeners()

    return () => {
      if (!this.commands.delete(command.id)) return
      this.notifyListeners()
    }
  }

  list(): AppCommand[] {
    return Array.from(this.commands.values())
  }

  search(query: string): AppCommand[] {
    const normalizedQuery = normalizeSearchText(query)
    if (!normalizedQuery) return this.list()

    return this.list().filter((command) => commandMatchesQuery(command, normalizedQuery))
  }

  async invoke(commandId: AppCommandId): Promise<void> {
    const command = this.commands.get(commandId)
    if (!command) {
      throw new Error(`App command not found: ${commandId}`)
    }

    await command.handler({ spacezero: window.spacezero })
  }

  getVersion(): number {
    return this.version
  }

  subscribe(listener: AppCommandRegistryListener): UnregisterAppCommand {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  private notifyListeners(): void {
    this.version += 1

    for (const listener of this.listeners) {
      listener()
    }
  }
}

function commandMatchesQuery(command: AppCommand, query: string): boolean {
  const searchableText = normalizeSearchText([command.title, command.category, ...(command.keywords ?? [])].join(' '))
  return searchableText.includes(query)
}

function normalizeSearchText(text: string): string {
  return text.trim().toLocaleLowerCase()
}
