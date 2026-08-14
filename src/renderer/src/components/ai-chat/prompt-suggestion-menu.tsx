import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

import { cn } from '@renderer/lib/utils'

export type PromptSuggestionMenuProps = {
  id: string
  label: string
  children: ReactNode
  className?: string
}

export function PromptSuggestionMenu({
  id,
  label,
  children,
  className
}: PromptSuggestionMenuProps): React.JSX.Element {
  return (
    <div
      id={id}
      aria-label={label}
      className={cn(
        'absolute inset-x-0 bottom-full z-50 mb-2 max-h-72 overflow-auto rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg',
        className
      )}
      role="listbox"
    >
      {children}
    </div>
  )
}

export type PromptSuggestionItemProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-selected' | 'children' | 'onSelect' | 'role' | 'type'
> & {
  icon: ReactNode
  title: ReactNode
  description?: ReactNode
  suffix?: ReactNode
  selected?: boolean
  titleClassName?: string
  children?: ReactNode
  onSelect: () => void
}

export function PromptSuggestionItem({
  icon,
  title,
  description,
  suffix,
  selected = false,
  disabled = false,
  titleClassName,
  children,
  onSelect,
  className,
  ...buttonProps
}: PromptSuggestionItemProps): React.JSX.Element {
  const itemRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!selected) return
    itemRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selected])

  return (
    <button
      ref={itemRef}
      type="button"
      role="option"
      aria-selected={selected}
      disabled={disabled}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-muted aria-selected:bg-muted disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onSelect}
      {...buttonProps}
    >
      <span className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm font-medium', titleClassName)}>{title}</span>
        {description ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{description}</span>
        ) : null}
        {children}
      </span>
      {suffix ? (
        <span className="shrink-0 text-[10px] uppercase text-muted-foreground">{suffix}</span>
      ) : null}
    </button>
  )
}

export function PromptSuggestionEmpty({ children }: { children: ReactNode }): React.JSX.Element {
  return <p className="px-3 py-2 text-xs text-muted-foreground">{children}</p>
}
