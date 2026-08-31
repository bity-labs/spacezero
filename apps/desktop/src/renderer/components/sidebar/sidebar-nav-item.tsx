import {
  SidebarMenuButton,
  SidebarMenuItem,
} from "@spacezero/ui/components/sidebar";
import type { ComponentType, ReactElement } from "react";

import { cn } from "@spacezero/ui/lib/utils";

type SidebarNavItemProps = {
  icon: ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  className?: string;
  onClick?: () => void;
};

function SidebarNavItem({
  icon: Icon,
  label,
  active = false,
  className,
  onClick,
}: SidebarNavItemProps): ReactElement {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        onClick={onClick}
        isActive={active}
        className={cn("text-muted-foreground", className)}
      >
        <Icon className="size-4" aria-hidden="true" />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export { SidebarNavItem };
