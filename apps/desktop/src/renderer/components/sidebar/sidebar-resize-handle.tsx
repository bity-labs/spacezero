import { DotsSixVertical } from "@phosphor-icons/react";
import { cn } from "@spacezero/ui/lib/utils";
import type { KeyboardEvent, PointerEvent, ReactElement } from "react";

type SidebarResizeHandleProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  className?: string;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
};

function SidebarResizeHandle({
  label,
  value,
  min,
  max,
  className,
  onPointerDown,
  onKeyDown,
}: SidebarResizeHandleProps): ReactElement {
  return (
    <div
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={value}
      className={cn(
        "titlebar-control flex cursor-col-resize items-center justify-center text-muted-foreground/55 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
      role="separator"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
    >
      <DotsSixVertical className="h-4 w-3" aria-hidden="true" />
    </div>
  );
}

export { SidebarResizeHandle };
