import { CaretDown } from "@phosphor-icons/react";
import { Button } from "@spacezero/ui/components/button";
import { cn } from "@spacezero/ui/lib/utils";
import type { ComponentType, ReactElement } from "react";

type SidebarSectionAction = {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onClick?: () => void;
};

type SidebarSectionHeaderProps = {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  actions?: readonly SidebarSectionAction[];
  className?: string;
};

function SidebarSectionHeader({
  label,
  icon: Icon,
  expandable = false,
  expanded = true,
  onToggle,
  actions = [],
  className,
}: SidebarSectionHeaderProps): ReactElement {
  return (
    <div
      className={cn(
        "flex h-8 items-center gap-1 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <button
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
        type="button"
        aria-expanded={expandable ? expanded : undefined}
        onClick={onToggle}
      >
        {Icon ? <Icon className="size-4 shrink-0" aria-hidden="true" /> : null}
        <span className="truncate">{label}</span>
        {expandable ? (
          <CaretDown
            className={cn(
              "size-4 shrink-0 transition-transform",
              expanded ? null : "-rotate-90",
            )}
            aria-hidden="true"
          />
        ) : null}
      </button>
      {actions.map((action) => {
        const Icon = action.icon;

        return (
          <Button
            key={action.label}
            variant="ghost"
            size="icon-xs"
            className="text-muted-foreground hover:bg-transparent hover:text-foreground"
            aria-label={action.label}
            onClick={action.onClick}
          >
            <Icon className="size-4" aria-hidden="true" />
          </Button>
        );
      })}
    </div>
  );
}

export { SidebarSectionHeader };
