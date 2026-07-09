import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarProvider
} from '@renderer/components/ui/sidebar'
import { cn } from '@renderer/lib/utils'
import { useUiLayoutStore } from '@renderer/stores/ui-layout-store'

type AppSidebarProps = React.ComponentProps<'aside'> & {
  side?: 'left' | 'right'
  header?: React.ReactNode
  footer?: React.ReactNode
  contentClassName?: string
}

function AppSidebar({
  side = 'left',
  header,
  footer,
  className,
  contentClassName,
  children,
  ...props
}: AppSidebarProps): React.JSX.Element {
  const isLeftSidebarOpen = useUiLayoutStore((state) => state.isLeftSidebarOpen)
  const isRightSidebarOpen = useUiLayoutStore((state) => state.isRightSidebarOpen)
  const setLeftSidebarOpen = useUiLayoutStore((state) => state.setLeftSidebarOpen)
  const setRightSidebarOpen = useUiLayoutStore((state) => state.setRightSidebarOpen)
  const isOpen = side === 'left' ? isLeftSidebarOpen : isRightSidebarOpen
  const setOpen = side === 'left' ? setLeftSidebarOpen : setRightSidebarOpen

  return (
    <aside
      className={cn(
        'flex min-w-0 flex-col bg-sidebar text-sidebar-foreground',
        side === 'left' ? 'border-r border-sidebar-border' : 'border-l border-sidebar-border',
        className
      )}
      {...props}
    >
      <SidebarProvider className="min-h-0 w-full flex-1" open={isOpen} onOpenChange={setOpen}>
        <Sidebar collapsible="none" side={side} className="w-full flex-1">
          {header ? <SidebarHeader>{header}</SidebarHeader> : null}
          <SidebarContent className={cn('px-2 pb-3', contentClassName)}>{children}</SidebarContent>
          {footer ? (
            <SidebarFooter className="titlebar-control px-2 pb-3">{footer}</SidebarFooter>
          ) : null}
        </Sidebar>
      </SidebarProvider>
    </aside>
  )
}

export { AppSidebar }
