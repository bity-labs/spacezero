import { MagnifyingGlass } from '@phosphor-icons/react'

import { Input } from '@renderer/components/ui/input'

type SidebarSearchProps = Omit<React.ComponentProps<typeof Input>, 'type' | 'className'> & {
  label: string
  className?: string
  inputClassName?: string
}

function SidebarSearch({ label, className, inputClassName, ...props }: SidebarSearchProps): React.JSX.Element {
  return (
    <label className={className}>
      <span className="sr-only">{label}</span>
      <span className="relative block">
        <MagnifyingGlass className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input className={inputClassName} type="search" {...props} />
      </span>
    </label>
  )
}

export { SidebarSearch }
