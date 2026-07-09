import { DotsSixVertical } from '@phosphor-icons/react'

import { cn } from '@renderer/lib/utils'

type SidebarResizeHandleProps = Omit<React.ComponentProps<'div'>, 'role'> & {
  label: string
  value: number
  min: number
  max: number
}

function SidebarResizeHandle({ label, value, min, max, className, ...props }: SidebarResizeHandleProps): React.JSX.Element {
  return (
    <div
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      className={cn(
        'titlebar-control flex cursor-col-resize items-center justify-center text-muted-foreground/55 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        className
      )}
      role="separator"
      tabIndex={0}
      {...props}
    >
      <DotsSixVertical className="h-4 w-3" aria-hidden="true" />
    </div>
  )
}

export { SidebarResizeHandle }
