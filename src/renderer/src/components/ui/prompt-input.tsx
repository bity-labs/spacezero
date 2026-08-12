'use client'

import {
  PaperPlaneIcon,
  PaperclipIcon,
  SpinnerIcon,
  StopIcon,
  XIcon
} from '@phosphor-icons/react'
import { nanoid } from 'nanoid'
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ChangeEventHandler,
  type ComponentProps,
  type FormEvent,
  type HTMLAttributes,
  type KeyboardEventHandler,
  type ReactNode
} from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea
} from '@renderer/components/ui/input-group'
import { cn } from '@renderer/lib/utils'

export type PromptInputFile = {
  id: string
  file: File
  path: string
}

export type PromptInputMessage = {
  text: string
  files: PromptInputFile[]
}

type PromptInputContextValue = {
  files: PromptInputFile[]
  openFileDialog: () => void
  removeFile: (id: string) => void
}

const PromptInputContext = createContext<PromptInputContextValue | null>(null)

const usePromptInput = () => {
  const context = useContext(PromptInputContext)

  if (!context) {
    throw new Error('PromptInput components must be used within PromptInput')
  }

  return context
}

export type PromptInputProps = Omit<HTMLAttributes<HTMLFormElement>, 'onSubmit'> & {
  disabled?: boolean
  resolveFilePath?: (file: File) => string
  onSubmit: (message: PromptInputMessage, event: FormEvent<HTMLFormElement>) => void
}

export const PromptInput = ({
  className,
  disabled = false,
  resolveFilePath,
  onSubmit,
  children,
  ...props
}: PromptInputProps) => {
  const [files, setFiles] = useState<PromptInputFile[]>([])
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const openFileDialog = useCallback(() => fileInputRef.current?.click(), [])
  const removeFile = useCallback(
    (id: string) => setFiles((currentFiles) => currentFiles.filter((file) => file.id !== id)),
    []
  )

  const handleFileChange: ChangeEventHandler<HTMLInputElement> = useCallback((event) => {
    const selectedFiles = Array.from(event.currentTarget.files ?? [])

    if (selectedFiles.length > 0) {
      setFiles((currentFiles) => [
        ...currentFiles,
        ...selectedFiles.map((file) => ({
          id: nanoid(),
          file,
          path: resolveFilePath?.(file) ?? file.name
        }))
      ])
    }

    event.currentTarget.value = ''
  }, [resolveFilePath])

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()

      if (disabled) {
        return
      }

      const form = event.currentTarget
      const formData = new FormData(form)
      const text = String(formData.get('message') ?? '').trim()

      if (text.length === 0 && files.length === 0) {
        return
      }

      onSubmit({ text, files }, event)
      form.reset()
      setFiles([])
    },
    [disabled, files, onSubmit]
  )

  const contextValue = useMemo(
    () => ({ files, openFileDialog, removeFile }),
    [files, openFileDialog, removeFile]
  )

  return (
    <PromptInputContext.Provider value={contextValue}>
      <input
        ref={fileInputRef}
        aria-label="Upload files"
        className="hidden"
        multiple
        onChange={handleFileChange}
        type="file"
      />
      <form className="w-full" onSubmit={handleSubmit} {...props}>
        <InputGroup data-disabled={disabled} className={cn('h-auto overflow-hidden', className)}>
          {children}
        </InputGroup>
      </form>
    </PromptInputContext.Provider>
  )
}

export type PromptInputTextareaProps = ComponentProps<typeof InputGroupTextarea>

export const PromptInputTextarea = ({
  className,
  onKeyDown,
  placeholder = 'Ask the agent anything...',
  ...props
}: PromptInputTextareaProps) => {
  const handleKeyDown: KeyboardEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      onKeyDown?.(event)

      if (
        event.defaultPrevented ||
        event.key !== 'Enter' ||
        event.shiftKey ||
        event.nativeEvent.isComposing
      ) {
        return
      }

      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    },
    [onKeyDown]
  )

  return (
    <InputGroupTextarea
      className={cn('field-sizing-content max-h-40 min-h-14', className)}
      name="message"
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      {...props}
    />
  )
}

export type PromptInputFooterProps = Omit<ComponentProps<typeof InputGroupAddon>, 'align'>

export const PromptInputFooter = ({ className, ...props }: PromptInputFooterProps) => (
  <InputGroupAddon
    align="block-end"
    className={cn('justify-between gap-1', className)}
    {...props}
  />
)

export type PromptInputToolsProps = HTMLAttributes<HTMLDivElement>

export const PromptInputTools = ({ className, ...props }: PromptInputToolsProps) => (
  <div className={cn('flex min-w-0 items-center gap-1', className)} {...props} />
)

export type PromptInputButtonProps = ComponentProps<typeof InputGroupButton> & {
  tooltip?: ReactNode
}

export const PromptInputButton = ({
  className,
  size = 'icon-sm',
  ...props
}: PromptInputButtonProps) => <InputGroupButton className={cn(className)} size={size} {...props} />

export type PromptInputActionMenuProps = ComponentProps<typeof DropdownMenu>

export const PromptInputActionMenu = (props: PromptInputActionMenuProps) => (
  <DropdownMenu {...props} />
)

export type PromptInputActionMenuTriggerProps = PromptInputButtonProps

export const PromptInputActionMenuTrigger = ({
  children,
  ...props
}: PromptInputActionMenuTriggerProps) => (
  <DropdownMenuTrigger render={<PromptInputButton {...props} />}>
    {children ?? <PaperclipIcon className="size-4" />}
  </DropdownMenuTrigger>
)

export type PromptInputAddAttachmentButtonProps = PromptInputButtonProps

export const PromptInputAddAttachmentButton = ({
  children,
  onClick,
  type = 'button',
  ...props
}: PromptInputAddAttachmentButtonProps) => {
  const { openFileDialog } = usePromptInput()

  return (
    <PromptInputButton
      {...props}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) openFileDialog()
      }}
      type={type}
    >
      {children ?? <PaperclipIcon className="size-4" />}
    </PromptInputButton>
  )
}

export type PromptInputActionMenuContentProps = ComponentProps<typeof DropdownMenuContent>

export const PromptInputActionMenuContent = ({
  className,
  ...props
}: PromptInputActionMenuContentProps) => (
  <DropdownMenuContent align="start" className={cn(className)} {...props} />
)

export type PromptInputActionAddAttachmentsProps = ComponentProps<typeof DropdownMenuItem> & {
  label?: string
}

export const PromptInputActionAddAttachments = ({
  label = 'Add photos or files',
  onSelect,
  ...props
}: PromptInputActionAddAttachmentsProps) => {
  const { openFileDialog } = usePromptInput()

  return (
    <DropdownMenuItem
      {...props}
      onSelect={(event) => {
        onSelect?.(event)
        if (!event.defaultPrevented) {
          openFileDialog()
        }
      }}
    >
      <PaperclipIcon className="size-4" />
      {label}
    </DropdownMenuItem>
  )
}

export type PromptInputAttachmentsProps = HTMLAttributes<HTMLDivElement>

export const PromptInputAttachments = ({ className, ...props }: PromptInputAttachmentsProps) => {
  const { files, removeFile } = usePromptInput()

  if (files.length === 0) {
    return null
  }

  return (
    <div className={cn('flex w-full flex-wrap justify-start gap-1 px-2 pt-2', className)} {...props}>
      {files.map(({ id, file, path }) => (
        <button
          key={id}
          className="flex max-w-48 items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => removeFile(id)}
          type="button"
        >
          <span className="truncate">{path || file.name}</span>
          <XIcon className="size-3" aria-hidden="true" />
          <span className="sr-only">Remove {file.name}</span>
        </button>
      ))}
    </div>
  )
}

export type PromptInputSubmitProps = ComponentProps<typeof InputGroupButton> & {
  status?: 'ready' | 'submitted' | 'streaming' | 'error'
  onStop?: () => void
}

export const PromptInputSubmit = ({
  className,
  variant = 'default',
  size = 'icon-sm',
  status = 'ready',
  onStop,
  children,
  ...props
}: PromptInputSubmitProps) => {
  const isRunning = status === 'submitted' || status === 'streaming'

  let icon = <PaperPlaneIcon className="size-4" />

  if (status === 'submitted') {
    icon = <SpinnerIcon className="size-4 animate-spin" />
  } else if (status === 'streaming') {
    icon = <StopIcon className="size-4" weight="fill" />
  } else if (status === 'error') {
    icon = <XIcon className="size-4" />
  }

  return (
    <InputGroupButton
      {...props}
      aria-label={isRunning ? 'Stop response' : 'Send message'}
      className={cn(className)}
      disabled={isRunning && !onStop}
      onClick={isRunning ? onStop : props.onClick}
      size={size}
      type={isRunning ? 'button' : 'submit'}
      variant={variant}
    >
      {children ?? icon}
    </InputGroupButton>
  )
}
