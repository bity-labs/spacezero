import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import {
  useAppCommandInvocationContext,
  useAppCommandRegistry,
  useAppCommands
} from '../../app-commands/renderer/app-command-context'
import { CommandPalette } from './command-palette'

type CommandPaletteControllerValue = {
  isOpen: boolean
  open: () => void
  close: () => void
  toggle: () => void
}

const CommandPaletteControllerContext = createContext<CommandPaletteControllerValue | null>(null)

type CommandPaletteControllerProviderProps = {
  children: ReactNode
}

export function CommandPaletteControllerProvider({
  children
}: CommandPaletteControllerProviderProps): React.JSX.Element {
  const commands = useAppCommands()
  const invocationContext = useAppCommandInvocationContext()
  const registry = useAppCommandRegistry()
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((currentIsOpen) => !currentIsOpen), [])

  const value = useMemo<CommandPaletteControllerValue>(
    () => ({ isOpen, open, close, toggle }),
    [close, isOpen, open, toggle]
  )

  return (
    <CommandPaletteControllerContext.Provider value={value}>
      {children}
      <CommandPalette
        commands={commands}
        invocationContext={invocationContext}
        isOpen={isOpen}
        registry={registry}
        onClose={close}
      />
    </CommandPaletteControllerContext.Provider>
  )
}

export function useCommandPaletteController(): CommandPaletteControllerValue {
  const context = useContext(CommandPaletteControllerContext)
  if (!context) {
    throw new Error('Command palette hooks must be used inside CommandPaletteControllerProvider')
  }

  return context
}
