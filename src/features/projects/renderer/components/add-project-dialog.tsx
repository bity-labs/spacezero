import { useState } from 'react'
import { Folder, GitBranch, PlusCircle } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type { Project } from '../../shared'
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

type AddProjectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreateEmptyProject: (request: { name: string }) => Promise<Project>
  onAddFromFolder: () => Promise<Project | null>
}

type SetupPath = 'empty' | 'folder' | 'git'

export function AddProjectDialog({
  open,
  onOpenChange,
  onCreateEmptyProject,
  onAddFromFolder
}: AddProjectDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [selectedPath, setSelectedPath] = useState<SetupPath>('empty')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const reset = (): void => {
    setSelectedPath('empty')
    setName('')
    setError(null)
    setIsSaving(false)
  }

  async function createEmptyProject(): Promise<void> {
    setIsSaving(true)
    setError(null)
    try {
      await onCreateEmptyProject({ name })
      reset()
      onOpenChange(false)
    } catch {
      setError(t('projects.add.saveError'))
      setIsSaving(false)
    }
  }

  async function addFolderProject(): Promise<void> {
    setIsSaving(true)
    setError(null)
    try {
      const project = await onAddFromFolder()
      if (project) {
        reset()
        onOpenChange(false)
        return
      }
      setIsSaving(false)
    } catch {
      setError(t('projects.add.folderError'))
      setIsSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        onOpenChange(nextOpen)
        if (!nextOpen) reset()
      }}
    >
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
            onClick={() => setSelectedPath('empty')}
          />
          <SetupPathButton
            active={selectedPath === 'folder'}
            icon={Folder}
            title={t('projects.add.folder.title')}
            description={t('projects.add.folder.description')}
            onClick={() => setSelectedPath('folder')}
          />
          <SetupPathButton
            disabled
            active={selectedPath === 'git'}
            icon={GitBranch}
            title={t('projects.add.git.title')}
            description={t('projects.add.git.description')}
            badge={t('projects.add.git.comingSoon')}
            onClick={() => setSelectedPath('git')}
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
              onChange={(event) => setName(event.target.value)}
            />
          </div>
        ) : null}

        {selectedPath === 'folder' ? (
          <p className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            {t('projects.add.folder.help')}
          </p>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          {selectedPath === 'folder' ? (
            <Button disabled={isSaving} onClick={() => void addFolderProject()}>
              {t('projects.add.folder.choose')}
            </Button>
          ) : (
            <Button disabled={isSaving || !name.trim()} onClick={() => void createEmptyProject()}>
              {t('projects.add.empty.create')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type SetupPathButtonProps = {
  active: boolean
  disabled?: boolean
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  badge?: string
  onClick: () => void
}

function SetupPathButton({
  active,
  disabled = false,
  icon: Icon,
  title,
  description,
  badge,
  onClick
}: SetupPathButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        'flex min-h-36 flex-col gap-2 rounded-lg border p-3 text-left transition hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-65',
        active ? 'border-primary bg-primary/5' : 'border-border bg-background'
      )}
      onClick={onClick}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
      <span className="font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{description}</span>
      {badge ? <span className="mt-auto text-xs font-medium text-muted-foreground">{badge}</span> : null}
    </button>
  )
}
