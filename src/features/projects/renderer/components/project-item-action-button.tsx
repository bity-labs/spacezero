import { cn } from '@renderer/lib/utils'

type ProjectItemActionButtonProps = {
  label: string
  icon: React.ComponentType<{ className?: string }>
  onClick?: () => void
  destructive?: boolean
  className?: string
}

export function ProjectItemActionButton({
  label,
  icon: Icon,
  onClick,
  destructive = false,
  className
}: ProjectItemActionButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        destructive ? 'hover:text-destructive' : null,
        className
      )}
      aria-label={label}
      onClick={(event) => {
        event.stopPropagation()
        onClick?.()
      }}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  )
}
