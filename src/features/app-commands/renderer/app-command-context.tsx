import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode
} from 'react'

import type { AppCommand, AppCommandInvocationContext } from './app-command.model'
import { AppCommandRegistry } from './app-command-registry'

type AppCommandContextValue = {
  registry: AppCommandRegistry
  commands: AppCommand[]
  invocationContext: AppCommandInvocationContext
}

const AppCommandContext = createContext<AppCommandContextValue | null>(null)

type AppCommandProviderProps = {
  children: ReactNode
  registry?: AppCommandRegistry
  invocationContext?: AppCommandInvocationContext
}

export function AppCommandProvider({
  children,
  invocationContext: providedInvocationContext,
  registry: providedRegistry
}: AppCommandProviderProps): React.JSX.Element {
  const [ownedRegistry] = useState(() => providedRegistry ?? new AppCommandRegistry())
  const registry = providedRegistry ?? ownedRegistry
  const registryVersion = useSyncExternalStore(
    (listener) => registry.subscribe(listener),
    () => registry.getVersion(),
    () => registry.getVersion()
  )

  const defaultInvocationContext = useMemo<AppCommandInvocationContext>(
    () => ({ spacezero: window.spacezero }),
    []
  )
  const invocationContext = providedInvocationContext ?? defaultInvocationContext

  const value = useMemo<AppCommandContextValue>(
    () => ({
      registry,
      commands: registry.list(),
      invocationContext
    }),
    [invocationContext, registry, registryVersion]
  )

  return <AppCommandContext.Provider value={value}>{children}</AppCommandContext.Provider>
}

export function useAppCommandRegistry(): AppCommandRegistry {
  return useAppCommandContext().registry
}

export function useAppCommands(): AppCommand[] {
  return useAppCommandContext().commands
}

export function useAppCommandInvocationContext(): AppCommandInvocationContext {
  return useAppCommandContext().invocationContext
}

export function useRegisterAppCommands(commands: readonly AppCommand[]): void {
  const registry = useAppCommandRegistry()

  useEffect(() => {
    const unregisterCommands = commands.map((command) => registry.register(command))

    return () => {
      // Unregister in reverse registration order so cleanup mirrors setup and avoids
      // surprises if commands ever share stateful side effects.
      for (const unregisterCommand of unregisterCommands.reverse()) {
        unregisterCommand()
      }
    }
  }, [commands, registry])
}

function useAppCommandContext(): AppCommandContextValue {
  const context = useContext(AppCommandContext)
  if (!context) {
    throw new Error('App command hooks must be used inside AppCommandProvider')
  }

  return context
}
