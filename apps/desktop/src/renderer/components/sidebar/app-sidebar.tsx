import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarProvider,
} from "@spacezero/ui/components/sidebar";
import { cn } from "@spacezero/ui/lib/utils";
import type { ReactElement, ReactNode } from "react";

type AppSidebarViewProps = React.ComponentProps<"aside"> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  header?: ReactNode;
  footer?: ReactNode;
  contentClassName?: string;
};

function AppSidebarView({
  open,
  onOpenChange,
  header,
  footer,
  className,
  contentClassName,
  children,
  ...props
}: AppSidebarViewProps): ReactElement {
  return (
    <aside
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        className,
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
          <SidebarContent className={cn("px-2 pb-3", contentClassName)}>{children}</SidebarContent>
          {footer ? <SidebarFooter className="titlebar-control px-2 pb-3">{footer}</SidebarFooter> : null}
        </Sidebar>
      </SidebarProvider>
    </aside>
  );
}

export { AppSidebarView };
