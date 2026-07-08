import { CaretDown } from '@phosphor-icons/react'

import { Button } from '@renderer/components/ui/button'
import { cn } from '@renderer/lib/utils'

type SidebarSectionAction = {
  label: string
  icon: React.ComponentType<{ className?: string }>
  onClick?: () => void
}

type SidebarSectionHeaderProps = {
  label: string
  expandable?: boolean
  actions?: readonly SidebarSectionAction[]
  className?: string
}

function SidebarSectionHeader({ label, expandable = false, actions = [], className }: SidebarSectionHeaderProps): React.JSX.Element {
  return (
    <div className={cn('flex items-center gap-1 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground', className)}>
      <button className="flex min-w-0 flex-1 items-center gap-1 text-left" type="button">
        <span className="truncate">{label}</span>
        {expandable ? <CaretDown className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
      </button>
      {actions.map((action) => {
        const Icon = action.icon

        return (
          <Button
            key={action.label}
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:bg-transparent hover:text-foreground"
            aria-label={action.label}
            onClick={action.onClick}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </Button>
        )
      })}
    </div>
  )
}

export { SidebarSectionHeader }
