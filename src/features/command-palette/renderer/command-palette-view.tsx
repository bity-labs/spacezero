import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from '@renderer/components/ui/command'

export type CommandPaletteViewCommand = {
  id: string
  title: string
  category: string
  shortcut?: string
  disabled?: boolean
  unavailableReason?: string
}

export type CommandPaletteViewProps = {
  commands: readonly CommandPaletteViewCommand[]
  invocationError: string | null
  isOpen: boolean
  query: string
  selectedCommandId: string
  onClose: () => void
  onInvokeCommand: (commandId: string) => void
  onQueryChange: (query: string) => void
  onSelectedCommandChange: (commandId: string) => void
}

export function CommandPaletteView({
  commands,
  invocationError,
  isOpen,
  query,
  selectedCommandId,
  onClose,
  onInvokeCommand,
  onQueryChange,
  onSelectedCommandChange
}: CommandPaletteViewProps): React.JSX.Element {
  const { t } = useTranslation()
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null)
  const commandGroups = useMemo(() => groupCommands(commands), [commands])

  useEffect(() => {
    if (!isOpen) return

    previouslyFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null

    return () => {
      previouslyFocusedElementRef.current?.focus()
      previouslyFocusedElementRef.current = null
    }
  }, [isOpen])

  return (
    <CommandDialog
      className="max-w-2xl border border-border shadow-2xl"
      description={t('commandPalette.description')}
      open={isOpen}
      title={t('commandPalette.title')}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {isOpen ? (
        <Command
          label={t('commandPalette.searchLabel')}
          shouldFilter={false}
          value={selectedCommandId}
          onValueChange={onSelectedCommandChange}
        >
          <CommandInput
            aria-label={t('commandPalette.searchLabel')}
            placeholder={t('commandPalette.searchPlaceholder')}
            value={query}
            onValueChange={onQueryChange}
          />
          {invocationError ? (
            <p className="px-3 py-2 text-sm text-destructive" role="alert">
              {invocationError}
            </p>
          ) : null}
          <CommandList label={t('commandPalette.commandsLabel')}>
            {commands.length > 0 ? (
              commandGroups.map(([category, groupCommands]) => (
                <CommandGroup key={category} heading={category}>
                  {groupCommands.map((command) => (
                    <CommandOption
                      key={command.id}
                      command={command}
                      onSelect={() => onInvokeCommand(command.id)}
                    />
                  ))}
                </CommandGroup>
              ))
            ) : (
              <CommandEmpty>{t('commandPalette.empty')}</CommandEmpty>
            )}
          </CommandList>
        </Command>
      ) : null}
    </CommandDialog>
  )
}

function CommandOption({
  command,
  onSelect
}: {
  command: CommandPaletteViewCommand
  onSelect: () => void
}): React.JSX.Element {
  const accessibleLabel = [command.title, command.category, command.unavailableReason]
    .filter(Boolean)
    .join(' — ')

  return (
    <CommandItem
      aria-label={accessibleLabel}
      disabled={command.disabled}
      value={command.id}
      onSelect={onSelect}
    >
      <span className="min-w-0 flex-1 truncate font-medium">{command.title}</span>
      {command.unavailableReason ? (
        <span className="truncate text-xs text-muted-foreground">{command.unavailableReason}</span>
      ) : null}
      {command.shortcut ? <CommandShortcut>{command.shortcut}</CommandShortcut> : null}
    </CommandItem>
  )
}

function groupCommands(
  commands: readonly CommandPaletteViewCommand[]
): [category: string, commands: CommandPaletteViewCommand[]][] {
  const groups = new Map<string, CommandPaletteViewCommand[]>()

  for (const command of commands) {
    const group = groups.get(command.category)
    if (group) group.push(command)
    else groups.set(command.category, [command])
  }

  return Array.from(groups.entries())
}
