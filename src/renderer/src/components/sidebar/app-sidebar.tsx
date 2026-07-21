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
  header?: React.ReactNode
  footer?: React.ReactNode
  contentClassName?: string
}

function AppSidebar({
  header,
  footer,
  className,
  contentClassName,
  children,
  ...props
}: AppSidebarProps): React.JSX.Element {
  const isLeftSidebarOpen = useUiLayoutStore((state) => state.isLeftSidebarOpen)
  const setLeftSidebarOpen = useUiLayoutStore((state) => state.setLeftSidebarOpen)

  return (
    <aside
      className={cn(
        'flex min-h-0 min-w-0 overflow-hidden flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
        className
      )}
      {...props}
    >
      <SidebarProvider
        className="min-h-0 w-full flex-1 overflow-hidden"
        open={isLeftSidebarOpen}
        onOpenChange={setLeftSidebarOpen}
      >
        <Sidebar collapsible="none" side="left" className="min-h-0 w-full flex-1 overflow-hidden">
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
