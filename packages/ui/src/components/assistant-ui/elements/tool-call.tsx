"use client";

import { CheckIcon, CaretRightIcon } from "@phosphor-icons/react";
import { Collapsible } from "@base-ui/react/collapsible";

import { cn } from "#lib/utils";
import {
  collapsePanel,
  field,
  mono,
  ShimmerLabel,
  SwapLabel,
} from "./surfaces";

export interface ToolCallProps {
  label: string;
  activeLabel: string;
  query: string;
  request: string;
  result: string;
  running: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  className?: string;
}

export function ToolCall({
  label,
  activeLabel,
  query,
  request,
  result,
  running,
  open,
  onOpenChange,
  className,
}: ToolCallProps) {
  return (
    <Collapsible.Root
      data-slot="tool-call"
      open={open}
      onOpenChange={onOpenChange}
      className={cn("w-full max-w-sm", className)}
    >
      <Collapsible.Trigger className="group/trigger flex items-center gap-2 rounded-md py-1 text-[13.5px] text-foreground/55 outline-none transition-colors hover:text-foreground/90">
        <CaretRightIcon className="size-3.5 shrink-0 opacity-60 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-data-[panel-open]/trigger:rotate-90 motion-reduce:transition-none" />
        <SwapLabel active={running ? 0 : 1} className="text-start">
          <ShimmerLabel active={running} className="relative inline-block leading-none">
            {activeLabel}
          </ShimmerLabel>
          <>{label}</>
        </SwapLabel>
        <span className={cn(mono, "rounded-md bg-foreground/[0.06] px-1.5 py-0.5 text-foreground/70")}>
          {query}
        </span>
        <span className="ms-auto flex w-4 items-center justify-end">
          {!running && (
            <CheckIcon className="fade-in zoom-in-90 animate-in size-3.5 text-primary duration-200" />
          )}
        </span>
      </Collapsible.Trigger>
      <Collapsible.Panel className={cn(collapsePanel, "outline-none")}>
        <div className={cn(field, "mt-2 overflow-hidden rounded-2xl text-xs")}>
          <div className="px-3.5 pt-2.5 pb-2">
            <p className={cn(mono, "mb-1 text-foreground/35")}>Request</p>
            <p className="font-mono text-foreground/55">{request}</p>
          </div>
          <div className="mx-3.5 h-px bg-foreground/[0.06]" />
          <div className="px-3.5 pt-2 pb-2.5">
            <p className={cn(mono, "mb-1 text-foreground/35")}>Result</p>
            <p className="text-foreground/90">{result}</p>
          </div>
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
