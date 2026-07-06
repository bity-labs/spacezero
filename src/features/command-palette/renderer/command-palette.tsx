import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import type { AppCommand } from '../../app-commands/renderer/app-command.model'
import type { AppCommandRegistry } from '../../app-commands/renderer/app-command-registry'

type CommandPaletteProps = {
  isOpen: boolean
  registry: AppCommandRegistry
  onClose: () => void
}

export function CommandPalette({ isOpen, registry, onClose }: CommandPaletteProps): React.JSX.Element | null {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const filteredCommands = registry.search(query)
  const clampedSelectedIndex = Math.min(selectedIndex, Math.max(filteredCommands.length - 1, 0))

  useEffect(() => {
    if (!isOpen) return

    window.requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [isOpen])

  if (!isOpen) return null

  function closePalette(): void {
    setQuery('')
    setSelectedIndex(0)
    onClose()
  }

  async function invokeSelectedCommand(): Promise<void> {
    const selectedCommand = filteredCommands[clampedSelectedIndex]
    if (!selectedCommand) return

    await registry.invoke(selectedCommand.id)
    closePalette()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === 'Escape') {
      event.preventDefault()
      closePalette()
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelectedIndex(() => (filteredCommands.length === 0 ? 0 : Math.min(clampedSelectedIndex + 1, filteredCommands.length - 1)))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelectedIndex(Math.max(clampedSelectedIndex - 1, 0))
      return
    }

    if (event.key === 'Home') {
      event.preventDefault()
      setSelectedIndex(0)
      return
    }

    if (event.key === 'End') {
      event.preventDefault()
      setSelectedIndex(Math.max(filteredCommands.length - 1, 0))
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      void invokeSelectedCommand()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-background/65 px-4 pt-[12vh] backdrop-blur-sm" role="presentation">
      <div
        aria-label="Command Palette"
        aria-modal="true"
        className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-2xl"
        role="dialog"
        onKeyDown={handleKeyDown}
      >
        <div className="border-b border-border p-3">
          <label className="sr-only" htmlFor="command-palette-search">
            Search commands
          </label>
          <input
            ref={searchInputRef}
            aria-activedescendant={filteredCommands[clampedSelectedIndex] ? commandOptionId(filteredCommands[clampedSelectedIndex]) : undefined}
            aria-controls="command-palette-list"
            aria-label="Search commands"
            className="h-11 w-full rounded-md border border-transparent bg-transparent px-3 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            id="command-palette-search"
            placeholder="Search commands…"
            role="searchbox"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setSelectedIndex(0)
            }}
          />
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {filteredCommands.length > 0 ? (
            <div aria-label="Commands" id="command-palette-list" role="listbox">
              {filteredCommands.map((command, index) => (
                <CommandOption
                  key={command.id}
                  command={command}
                  isSelected={index === clampedSelectedIndex}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onSelect={() => {
                    setSelectedIndex(index)
                    void registry.invoke(command.id).then(closePalette)
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">No commands found.</p>
          )}
        </div>
      </div>
    </div>
  )
}

type CommandOptionProps = {
  command: AppCommand
  isSelected: boolean
  onMouseEnter: () => void
  onSelect: () => void
}

function CommandOption({ command, isSelected, onMouseEnter, onSelect }: CommandOptionProps): React.JSX.Element {
  return (
    <button
      aria-label={`${command.title} — ${command.category}`}
      aria-selected={isSelected}
      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm outline-none aria-selected:bg-accent aria-selected:text-accent-foreground hover:bg-accent hover:text-accent-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      id={commandOptionId(command)}
      role="option"
      type="button"
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
    >
      <span className="font-medium">{command.title}</span>
      <span className="text-xs text-muted-foreground">{command.category}</span>
    </button>
  )
}

function commandOptionId(command: AppCommand): string {
  return `command-palette-option-${command.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}
