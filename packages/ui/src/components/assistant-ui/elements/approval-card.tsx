"use client";

import type { ComponentProps } from "react";
import {
  CheckIcon,
  SpinnerIcon,
  TerminalWindowIcon,
  XIcon,
} from "@phosphor-icons/react";

import { cn } from "#lib/utils";
import { field, inkButton, paper } from "./surfaces";

export type ApprovalState = "request" | "running" | "done" | "denied";

export function ApprovalCard({
  state,
  command,
  title,
  subtitle,
  onAllowOnce,
  onAlwaysAllow,
  onDeny,
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  | "children"
  | "state"
  | "command"
  | "title"
  | "subtitle"
  | "onAllowOnce"
  | "onAlwaysAllow"
  | "onDeny"
> & {
  state: ApprovalState;
  command: string;
  title: string;
  subtitle: string;
  onAllowOnce?: () => void;
  onAlwaysAllow?: () => void;
  onDeny?: () => void;
}) {
  return (
    <div
      data-slot="approval-card"
      className={cn(paper, "flex w-full max-w-sm flex-col gap-3.5 rounded-[20px] p-4", className)}
      {...props}
    >
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-foreground/[0.05] text-foreground/45">
          <TerminalWindowIcon className="size-4" />
        </span>
        <div className="flex flex-col">
          <p className="text-[13.5px] font-medium">{title}</p>
          <p className="text-xs text-foreground/45">{subtitle}</p>
        </div>
      </div>

      <div className={cn(field, "rounded-xl px-3.5 py-2.5 font-mono text-xs text-foreground/70")}>
        {command}
      </div>

      <div className="flex h-8 items-center justify-end gap-2">
        {state === "request" ? (
          <>
            <button
              type="button"
              onClick={onDeny}
              className="h-8 rounded-full px-3.5 text-xs font-medium text-foreground/55 transition-[background-color,color,scale] duration-150 hover:bg-foreground/[0.06] hover:text-foreground/90 active:scale-[0.96]"
            >
              Deny
            </button>
            <button
              type="button"
              onClick={onAlwaysAllow}
              className="h-8 rounded-full px-3.5 text-xs font-medium text-foreground/55 transition-[background-color,color,scale] duration-150 hover:bg-foreground/[0.06] hover:text-foreground/90 active:scale-[0.96]"
            >
              Always allow
            </button>
            <button
              type="button"
              onClick={onAllowOnce}
              className={cn(inkButton, "flex h-8 items-center rounded-full px-3.5 text-xs font-medium")}
            >
              Allow once
            </button>
          </>
        ) : (
          <div
            key={state}
            className="fade-in animate-in flex items-center gap-2 text-xs text-foreground/55 duration-300"
          >
            {state === "running" ? (
              <>
                <SpinnerIcon className="size-3.5 animate-spin text-foreground/45" />
                Approved, running
              </>
            ) : state === "denied" ? (
              <>
                <XIcon className="size-3.5 text-foreground/45" />
                Denied
              </>
            ) : (
              <>
                <CheckIcon className="size-3.5 text-primary" />
                Finished with exit 0
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
