import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { useAppCommandRegistry } from '../../app-commands/renderer/app-command-context'
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

export function CommandPaletteControllerProvider({ children }: CommandPaletteControllerProviderProps): React.JSX.Element {
  const registry = useAppCommandRegistry()
  const [isOpen, setIsOpen] = useState(false)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen((currentIsOpen) => !currentIsOpen), [])

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent): void {
      const isPaletteChord = (event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'k'
      if (!isPaletteChord) return

      event.preventDefault()
      toggle()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggle])

  const value = useMemo<CommandPaletteControllerValue>(() => ({ isOpen, open, close, toggle }), [close, isOpen, open, toggle])

  return (
    <CommandPaletteControllerContext.Provider value={value}>
      {children}
      <CommandPalette isOpen={isOpen} registry={registry} onClose={close} />
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
