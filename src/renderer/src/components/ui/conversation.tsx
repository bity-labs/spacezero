'use client'

import { MessageScroller, useMessageScrollerScrollable } from '@shadcn/react/message-scroller'
import { ArrowDownIcon, DownloadSimpleIcon } from '@phosphor-icons/react'
import type { ComponentProps, ReactNode } from 'react'
import { useCallback } from 'react'

import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

export type ConversationProps = ComponentProps<typeof MessageScroller.Root> & {
  viewportClassName?: string
}

export const Conversation = ({
  className,
  viewportClassName,
  children,
  ...props
}: ConversationProps) => (
  <MessageScroller.Provider autoScroll defaultScrollPosition="end">
    <MessageScroller.Root className={cn('relative flex-1 overflow-hidden', className)} {...props}>
      <MessageScroller.Viewport
        aria-label="Conversation"
        className={cn('no-scrollbar h-full overflow-y-auto', viewportClassName)}
        preserveScrollOnPrepend
      >
        {children}
      </MessageScroller.Viewport>
    </MessageScroller.Root>
  </MessageScroller.Provider>
)

export type ConversationContentProps = ComponentProps<typeof MessageScroller.Content>

export const ConversationContent = ({ className, ...props }: ConversationContentProps) => (
  <MessageScroller.Content className={cn('flex min-h-full flex-col gap-8 p-4', className)} {...props} />
)

export type ConversationItemProps = ComponentProps<typeof MessageScroller.Item>

export const ConversationItem = ({ className, ...props }: ConversationItemProps) => (
  <MessageScroller.Item className={cn('min-w-0', className)} {...props} />
)

export type ConversationEmptyStateProps = ComponentProps<'div'> & {
  title?: string
  description?: string
  icon?: ReactNode
}

export const ConversationEmptyState = ({
  className,
  title = 'No messages yet',
  description = 'Start a conversation to see messages here',
  icon,
  children,
  ...props
}: ConversationEmptyStateProps) => (
  <div
    className={cn(
      'flex size-full flex-col items-center justify-center gap-3 p-8 text-center',
      className
    )}
    {...props}
  >
    {children ?? (
      <>
        {icon && <div className="text-muted-foreground">{icon}</div>}
        <div className="space-y-1">
          <h3 className="font-medium text-sm">{title}</h3>
          {description && <p className="text-muted-foreground text-sm">{description}</p>}
        </div>
      </>
    )}
  </div>
)

export type ConversationScrollButtonProps = ComponentProps<typeof Button>

export const ConversationScrollButton = ({
  className,
  ...props
}: ConversationScrollButtonProps) => {
  const { end: isAtEnd } = useMessageScrollerScrollable()

  return (
    <MessageScroller.Button
      behavior="smooth"
      direction="end"
      render={(buttonProps, state) =>
        state.active && !isAtEnd ? (
          <Button
            className={cn(
              'absolute bottom-4 left-[50%] translate-x-[-50%] rounded-full dark:bg-background dark:hover:bg-muted',
              className
            )}
            aria-label="Scroll to bottom"
            size="icon"
            variant="outline"
            {...props}
            {...buttonProps}
          >
            <ArrowDownIcon className="size-4" />
          </Button>
        ) : null
      }
    />
  )
}

export type ConversationDownloadMessage = {
  role: string
  parts: readonly { type: string; text?: string }[]
}

const getMessageText = (message: ConversationDownloadMessage): string =>
  message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('')

export type ConversationDownloadProps = Omit<ComponentProps<typeof Button>, 'onClick'> & {
  messages: ConversationDownloadMessage[]
  filename?: string
  formatMessage?: (message: ConversationDownloadMessage, index: number) => string
}

const defaultFormatMessage = (message: ConversationDownloadMessage): string => {
  const roleLabel = message.role.charAt(0).toUpperCase() + message.role.slice(1)
  return `**${roleLabel}:** ${getMessageText(message)}`
}

export const messagesToMarkdown = (
  messages: ConversationDownloadMessage[],
  formatMessage: (message: ConversationDownloadMessage, index: number) => string = defaultFormatMessage
): string => messages.map((msg, i) => formatMessage(msg, i)).join('\n\n')

export const ConversationDownload = ({
  messages,
  filename = 'conversation.md',
  formatMessage = defaultFormatMessage,
  className,
  children,
  ...props
}: ConversationDownloadProps) => {
  const handleDownload = useCallback(() => {
    const markdown = messagesToMarkdown(messages, formatMessage)
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }, [messages, filename, formatMessage])

  return (
    <Button
      className={cn(
        'absolute top-4 right-4 rounded-full dark:bg-background dark:hover:bg-muted',
        className
      )}
      onClick={handleDownload}
      size="icon"
      type="button"
      variant="outline"
      {...props}
    >
      {children ?? <DownloadSimpleIcon className="size-4" />}
    </Button>
  )
}
