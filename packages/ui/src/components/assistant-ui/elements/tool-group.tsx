"use client";

import type { ComponentProps } from "react";
import {
  CaretRightIcon,
  CheckIcon,
  SpinnerIcon,
  XIcon,
} from "@phosphor-icons/react";

import { cn } from "#lib/utils";
import { mono, paper } from "./surfaces";

export type GroupedToolState = "running" | "done" | "failed";

export interface GroupedTool {
  id: string;
  name: string;
  target: string;
  state: GroupedToolState;
  durationMs?: number;
}

export function ToolGroup({
  label,
  tools,
  open,
  onOpenChange,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "label" | "tools" | "open" | "onOpenChange"
> & {
  label: string;
  tools: readonly GroupedTool[];
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const running = tools.filter((tool) => tool.state === "running").length;
  const failed = tools.filter((tool) => tool.state === "failed").length;

  return (
    <div
      data-slot="tool-group"
      className={cn(
        paper,
        "flex w-full max-w-sm flex-col overflow-hidden rounded-2xl",
        className,
      )}
      {...props}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onOpenChange?.(!open)}
        className="flex items-center gap-2.5 px-3.5 py-2.5 text-start transition-colors hover:bg-foreground/[0.03]"
      >
        <CaretRightIcon
          className={cn(
            "size-3 shrink-0 text-foreground/25 transition-transform duration-200 motion-reduce:transition-none",
            open && "rotate-90",
          )}
        />
        <span className="min-w-0 flex-1 truncate text-[13.5px]">{label}</span>
        <span className={cn(mono, "shrink-0 tabular-nums text-foreground/30")}>
          {running > 0
            ? `${tools.length - running}/${tools.length}`
            : failed > 0
              ? `${failed} failed`
              : `${tools.length} done`}
        </span>
        {running > 0 ? (
          <SpinnerIcon className="size-3.5 shrink-0 animate-spin text-foreground/35 motion-reduce:animate-none" />
        ) : failed > 0 ? (
          <XIcon className="size-3.5 shrink-0 text-destructive" />
        ) : (
          <CheckIcon className="size-3.5 shrink-0 text-primary" />
        )}
      </button>

      {open && (
        <div className="fade-in slide-in-from-top-1 animate-in flex flex-col border-t border-foreground/[0.06] duration-200">
          {tools.map((tool) => (
            <div key={tool.id} className="flex items-center gap-2.5 px-3.5 py-2">
              <span className="flex size-3.5 shrink-0 items-center justify-center">
                {tool.state === "running" ? (
                  <SpinnerIcon className="size-3 animate-spin text-foreground/35 motion-reduce:animate-none" />
                ) : tool.state === "failed" ? (
                  <XIcon className="size-3 text-destructive" />
                ) : (
                  <CheckIcon className="size-3 text-primary" />
                )}
              </span>
              <span className={cn(mono, "shrink-0 text-foreground/55")}>{tool.name}</span>
              <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/80">
                {tool.target}
              </span>
              {tool.durationMs !== undefined && (
                <span className={cn(mono, "shrink-0 tabular-nums text-foreground/25")}>
                  {tool.durationMs}ms
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
