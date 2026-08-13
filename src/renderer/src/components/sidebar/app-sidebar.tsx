import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarProvider
} from '@renderer/components/ui/sidebar'
import { cn } from '@renderer/lib/utils'
import { useUiLayoutStore } from '@renderer/stores/ui-layout-store'

type AppSidebarViewProps = React.ComponentProps<'aside'> & {
  open: boolean
  onOpenChange: (open: boolean) => void
  header?: React.ReactNode
  footer?: React.ReactNode
  contentClassName?: string
}

type AppSidebarProps = Omit<AppSidebarViewProps, 'open' | 'onOpenChange'>

function AppSidebarView({
  open,
  onOpenChange,
  header,
  footer,
  className,
  contentClassName,
  children,
  ...props
}: AppSidebarViewProps): React.JSX.Element {
  return (
    <aside
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
        className
      )}
      {...props}
    >
      <SidebarProvider
        className="min-h-0 w-full flex-1 overflow-hidden"
        open={open}
        onOpenChange={onOpenChange}
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

function AppSidebar(props: AppSidebarProps): React.JSX.Element {
  const isLeftSidebarOpen = useUiLayoutStore((state) => state.isLeftSidebarOpen)
  const setLeftSidebarOpen = useUiLayoutStore((state) => state.setLeftSidebarOpen)

  return <AppSidebarView {...props} open={isLeftSidebarOpen} onOpenChange={setLeftSidebarOpen} />
}

export { AppSidebar, AppSidebarView }
