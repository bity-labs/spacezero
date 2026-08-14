import type { ReactNode } from 'react'
import { Info } from '@phosphor-icons/react'

import { cn } from '@renderer/lib/utils'
import { Button } from './ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'

export type NotificationIconButtonTone = 'info' | 'success' | 'warning'

export type NotificationIconButtonProps = {
  label: string
  tooltip: ReactNode
  tone?: NotificationIconButtonTone
  disabled?: boolean
  icon?: ReactNode
  onNotificationClick: () => void
}

const toneClassNames: Record<NotificationIconButtonTone, string> = {
  info: 'text-blue-500 hover:bg-blue-500/10 hover:text-blue-400',
  success: 'text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400',
  warning: 'text-amber-500 hover:bg-amber-500/10 hover:text-amber-400'
}

export function NotificationIconButton({
  label,
  tooltip,
  tone = 'info',
  disabled = false,
  icon,
  onNotificationClick
}: NotificationIconButtonProps): React.JSX.Element {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={cn('rounded-full', toneClassNames[tone])}
      disabled={disabled}
      aria-label={label}
      onClick={onNotificationClick}
    >
      {icon ?? <Info className="h-4 w-4" aria-hidden="true" />}
    </Button>
  )

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
