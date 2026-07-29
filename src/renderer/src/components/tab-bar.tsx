import {
  useEffect,
  useRef,
  type DragEventHandler,
  type MouseEventHandler,
  type ReactNode,
  type WheelEvent
} from 'react'

import { Button } from './ui/button'

export function Tab({
  ariaLabel,
  closeAriaLabel,
  closeTitle,
  draggable,
  icon,
  label,
  labelSuffix,
  leading,
  preview,
  selected,
  onSelect,
  onClose,
  onDoubleClick,
  onDragOver,
  onDragStart,
  onDrop
}: {
  ariaLabel?: string
  closeAriaLabel?: string
  closeTitle?: string
  draggable?: boolean
  icon?: ReactNode
  label: string
  labelSuffix?: ReactNode
  leading?: ReactNode
  preview?: boolean
  selected: boolean
  onSelect: () => void
  onClose: () => void
  onDoubleClick?: MouseEventHandler<HTMLButtonElement>
  onDragOver?: DragEventHandler<HTMLDivElement>
  onDragStart?: DragEventHandler<HTMLDivElement>
  onDrop?: DragEventHandler<HTMLDivElement>
}): React.JSX.Element {
  const tabRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (selected) tabRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [selected])

  return (
    <div
      className={`flex min-w-32 max-w-56 shrink-0 items-center gap-1 rounded-md border px-1 py-1 text-sm ${
        selected ? 'bg-muted text-foreground' : 'bg-background text-muted-foreground'
      }`}
      draggable={draggable}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
      onDrop={onDrop}
    >
      <button
        ref={tabRef}
        aria-label={ariaLabel}
        aria-selected={selected}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${preview ? 'italic' : ''}`}
        role="tab"
        tabIndex={selected ? 0 : -1}
        type="button"
        onClick={onSelect}
        onDoubleClick={onDoubleClick}
        onMouseDown={(event) => {
          if (event.button === 1) event.preventDefault()
        }}
        onAuxClick={(event) => {
          if (event.button !== 1) return
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect()
            return
          }
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          const tablist = event.currentTarget.closest('[role="tablist"]')
          const tabs = Array.from(tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
          const currentIndex = tabs.indexOf(event.currentTarget)
          if (currentIndex < 0 || tabs.length === 0) return
          const targetIndex =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? tabs.length - 1
                : event.key === 'ArrowLeft'
                  ? (currentIndex - 1 + tabs.length) % tabs.length
                  : (currentIndex + 1) % tabs.length
          event.preventDefault()
          tabs[targetIndex]?.focus()
          tabs[targetIndex]?.click()
        }}
      >
        {leading}
        {icon}
        <span className="truncate">{label}</span>
        {labelSuffix}
      </button>
      <Button
        aria-label={closeAriaLabel ?? `Close ${label}`}
        className="h-6 px-2"
        size="sm"
        title={closeTitle}
        type="button"
        variant="ghost"
        onClick={onClose}
      >
        ×
      </Button>
    </div>
  )
}

export function TabBar({
  ariaLabel,
  children,
  endControl
}: {
  ariaLabel: string
  children: ReactNode
  endControl?: ReactNode
}): React.JSX.Element {
  function scrollHorizontally(event: WheelEvent<HTMLDivElement>): void {
    if (event.deltaY === 0) return
    event.currentTarget.scrollLeft += event.deltaY
    event.preventDefault()
  }

  return (
    <div className="flex shrink-0 items-center border-b bg-background">
      <div
        aria-label={ariaLabel}
        className="no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-2 py-1"
        role="tablist"
        onWheel={scrollHorizontally}
      >
        {children}
      </div>
      {endControl ? <div className="shrink-0 pr-2">{endControl}</div> : null}
    </div>
  )
}
