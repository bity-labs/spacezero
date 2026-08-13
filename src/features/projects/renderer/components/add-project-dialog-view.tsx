import type { ReactNode } from 'react'
import { Folder, GitBranch, PlusCircle } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { AgentResourceTrustCheckbox } from './agent-resource-trust-checkbox'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { cn } from '@renderer/lib/utils'

export type AddProjectSetupPath = 'empty' | 'folder' | 'git'

export type AddProjectDialogViewProps = {
  open: boolean
  selectedPath: AddProjectSetupPath
  name: string
  error: string | null
  agentResourcesTrusted: boolean
  isSaving: boolean
  githubSetupContent: ReactNode
  onOpenChange: (open: boolean) => void
  onCancel: () => void
  onSelectPath: (path: AddProjectSetupPath) => void
  onNameChange: (name: string) => void
  onAgentResourcesTrustedChange: (trusted: boolean) => void
  onCreateEmptyProject: () => void
  onAddFolderProject: () => void
}

export function AddProjectDialogView({
  open,
  selectedPath,
  name,
  error,
  agentResourcesTrusted,
  isSaving,
  githubSetupContent,
  onOpenChange,
  onCancel,
  onSelectPath,
  onNameChange,
  onAgentResourcesTrustedChange,
  onCreateEmptyProject,
  onAddFolderProject
}: AddProjectDialogViewProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('projects.add.title')}</DialogTitle>
          <DialogDescription>{t('projects.add.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <SetupPathButton
            active={selectedPath === 'empty'}
            icon={PlusCircle}
            title={t('projects.add.empty.title')}
            description={t('projects.add.empty.description')}
            onClick={() => onSelectPath('empty')}
          />
          <SetupPathButton
            active={selectedPath === 'folder'}
            icon={Folder}
            title={t('projects.add.folder.title')}
            description={t('projects.add.folder.description')}
            onClick={() => onSelectPath('folder')}
          />
          <SetupPathButton
            active={selectedPath === 'git'}
            icon={GitBranch}
            title={t('projects.add.git.title')}
            description={t('projects.add.git.description')}
            onClick={() => onSelectPath('git')}
          />
        </div>

        {selectedPath === 'empty' ? (
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="empty-project-name">
              {t('projects.add.empty.nameLabel')}
            </label>
            <Input
              id="empty-project-name"
              value={name}
              placeholder={t('projects.add.empty.namePlaceholder')}
              onChange={(event) => onNameChange(event.target.value)}
            />
          </div>
        ) : null}

        {selectedPath === 'folder' ? (
          <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            {t('projects.add.folder.help')}
          </p>
        ) : null}

        {selectedPath === 'git' ? githubSetupContent : null}

        {selectedPath === 'empty' || selectedPath === 'folder' ? (
          <AgentResourceTrustCheckbox
            checked={agentResourcesTrusted}
            onCheckedChange={onAgentResourcesTrustedChange}
          />
        ) : null}

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        {selectedPath === 'empty' || selectedPath === 'folder' ? (
          <DialogFooter>
            <Button variant="outline" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
            {selectedPath === 'folder' ? (
              <Button disabled={isSaving} onClick={onAddFolderProject}>
                {t('projects.add.folder.choose')}
              </Button>
            ) : (
              <Button disabled={isSaving || !name.trim()} onClick={onCreateEmptyProject}>
                {t('projects.add.empty.create')}
              </Button>
            )}
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

type SetupPathButtonProps = {
  active: boolean
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  onClick: () => void
}

function SetupPathButton({
  active,
  icon: Icon,
  title,
  description,
  onClick
}: SetupPathButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'flex min-h-36 flex-col gap-2 rounded-lg border p-3 text-left transition hover:bg-muted/50',
        active ? 'border-primary bg-primary/5' : 'border-border bg-background'
      )}
      onClick={onClick}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span className="font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
    </button>
  )
}
