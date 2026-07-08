import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarProvider
} from '@renderer/components/ui/sidebar'
import { cn } from '@renderer/lib/utils'

type AppSidebarProps = React.ComponentProps<'aside'> & {
  side?: 'left' | 'right'
  header?: React.ReactNode
  footer?: React.ReactNode
  contentClassName?: string
}

function AppSidebar({ side = 'left', header, footer, className, contentClassName, children, ...props }: AppSidebarProps): React.JSX.Element {
  return (
    <aside
      className={cn(
        'flex min-w-0 flex-col bg-sidebar text-sidebar-foreground',
        side === 'left' ? 'border-r border-sidebar-border' : 'border-l border-sidebar-border',
        className
      )}
      {...props}
    >
      <SidebarProvider className="min-h-0 w-full flex-1">
        <Sidebar collapsible="none" side={side} className="w-full flex-1">
          {header ? <SidebarHeader>{header}</SidebarHeader> : null}
          <SidebarContent className={cn('px-2 pb-3', contentClassName)}>{children}</SidebarContent>
          {footer ? <SidebarFooter className="titlebar-control px-2 pb-3">{footer}</SidebarFooter> : null}
        </Sidebar>
      </SidebarProvider>
    </aside>
  )
}

export { AppSidebar }
