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
import type { AppCommandRegistry } from '../../app-commands/renderer/app-command-registry'

type CommandPaletteProps = {
  isOpen: boolean
  registry: AppCommandRegistry
  onClose: () => void
}

export function CommandPalette({ isOpen, registry, onClose }: CommandPaletteProps): React.JSX.Element {
  const { t } = useTranslation()
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!isOpen) return

    previouslyFocusedElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

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
      {isOpen ? <CommandPaletteContent registry={registry} onClose={onClose} /> : null}
    </CommandDialog>
  )
}

type CommandPaletteContentProps = {
  registry: AppCommandRegistry
  onClose: () => void
}

function CommandPaletteContent({ registry, onClose }: CommandPaletteContentProps): React.JSX.Element {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [selectedCommandId, setSelectedCommandId] = useState<AppCommandId>('')
  const filteredCommands = useMemo(() => registry.search(query), [query, registry])
  const activeCommandId = filteredCommands.some((command) => command.id === selectedCommandId)
    ? selectedCommandId
    : (filteredCommands[0]?.id ?? '')

  async function invokeCommand(commandId: AppCommandId): Promise<void> {
    await registry.invoke(commandId)
    onClose()
  }

  return (
    <Command label={t('commandPalette.searchLabel')} shouldFilter={false} value={activeCommandId} onValueChange={setSelectedCommandId}>
      <CommandInput
        aria-label={t('commandPalette.searchLabel')}
        placeholder={t('commandPalette.searchPlaceholder')}
        value={query}
        onValueChange={(nextQuery) => {
          setQuery(nextQuery)
          setSelectedCommandId('')
        }}
      />
      <CommandList label={t('commandPalette.commandsLabel')}>
        {filteredCommands.length > 0 ? (
          <CommandGroup heading={t('commandPalette.commandsLabel')}>
            {filteredCommands.map((command) => (
              <CommandOption key={command.id} command={command} onSelect={() => void invokeCommand(command.id)} />
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
    <CommandItem aria-label={`${command.title} — ${command.category}`} value={command.id} onSelect={onSelect}>
      <span className="font-medium">{command.title}</span>
      <span className="ml-auto text-xs text-muted-foreground">{command.category}</span>
    </CommandItem>
  )
}
