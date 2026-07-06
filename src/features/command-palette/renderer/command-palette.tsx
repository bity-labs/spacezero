import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList
} from '@renderer/components/ui/command'

import type { AppCommand, AppCommandId } from '../../app-commands/renderer/app-command.model'

type CommandPaletteProps = {
  commands: readonly AppCommand[]
  isOpen: boolean
  invokeCommand: (commandId: AppCommandId) => void | Promise<void>
  searchCommands: (query: string) => AppCommand[]
  onClose: () => void
}

export function CommandPalette({
  commands,
  isOpen,
  invokeCommand,
  searchCommands,
  onClose
}: CommandPaletteProps): React.JSX.Element {
  const { t } = useTranslation()
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    previouslyFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    return () => {
      previouslyFocusedElementRef.current?.focus()
      previouslyFocusedElementRef.current = null
    }
  }, [isOpen])

  function handleOpenChange(open: boolean): void {
    if (!open) onClose()
  }

  return (
    <CommandDialog
      className="max-w-2xl border border-border shadow-2xl"
      description={t('commandPalette.description')}
      open={isOpen}
      title={t('commandPalette.title')}
      onOpenChange={handleOpenChange}
    >
      {isOpen ? (
        <CommandPaletteContent
          commands={commands}
          invokeCommand={invokeCommand}
          searchCommands={searchCommands}
          onClose={onClose}
        />
      ) : null}
    </CommandDialog>
  )
}

type CommandPaletteContentProps = {
  commands: readonly AppCommand[]
  invokeCommand: (commandId: AppCommandId) => void | Promise<void>
  searchCommands: (query: string) => AppCommand[]
  onClose: () => void
}

function CommandPaletteContent({
  commands,
  invokeCommand,
  searchCommands,
  onClose
}: CommandPaletteContentProps): React.JSX.Element {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [selectedCommandId, setSelectedCommandId] = useState<AppCommandId>('')
  const [invocationError, setInvocationError] = useState<string | null>(null)
  // `commands` is included as a dependency because `searchCommands` closes over a stable
  // registry reference; the command list from context signals when registrations changed.
  const filteredCommands = useMemo(() => searchCommands(query), [commands, query, searchCommands])
  const activeCommandId = filteredCommands.some((command) => command.id === selectedCommandId)
    ? selectedCommandId
    : (filteredCommands[0]?.id ?? '')

  async function handleInvokeCommand(commandId: AppCommandId): Promise<void> {
    setInvocationError(null)

    try {
      await invokeCommand(commandId)
      onClose()
    } catch {
      setInvocationError(t('commandPalette.invocationError'))
    }
  }

  return (
    <Command
      label={t('commandPalette.searchLabel')}
      shouldFilter={false}
      value={activeCommandId}
      onValueChange={setSelectedCommandId}
    >
      <CommandInput
        aria-label={t('commandPalette.searchLabel')}
        placeholder={t('commandPalette.searchPlaceholder')}
        value={query}
        onValueChange={(nextQuery) => {
          setQuery(nextQuery)
          setSelectedCommandId('')
        }}
      />
      {invocationError ? (
        <p className="px-3 py-2 text-sm text-destructive" role="alert">
          {invocationError}
        </p>
      ) : null}
      <CommandList label={t('commandPalette.commandsLabel')}>
        {filteredCommands.length > 0 ? (
          <CommandGroup heading={t('commandPalette.commandsLabel')}>
            {filteredCommands.map((command) => (
              <CommandOption
                key={command.id}
                command={command}
                onSelect={() => void handleInvokeCommand(command.id)}
              />
            ))}
          </CommandGroup>
        ) : (
          <CommandEmpty>{t('commandPalette.empty')}</CommandEmpty>
        )}
      </CommandList>
    </Command>
  )
}

type CommandOptionProps = {
  command: AppCommand
  onSelect: () => void
}

function CommandOption({ command, onSelect }: CommandOptionProps): React.JSX.Element {
  return (
    <CommandItem
      aria-label={`${command.title} — ${command.category}`}
      value={command.id}
      onSelect={onSelect}
    >
      <span className="font-medium">{command.title}</span>
      <span className="ml-auto text-xs text-muted-foreground">{command.category}</span>
    </CommandItem>
  )
}

