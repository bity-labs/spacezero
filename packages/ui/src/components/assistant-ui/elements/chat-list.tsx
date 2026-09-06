import type { ComponentProps } from "react";
import {
  Archive,
  ArrowCounterClockwise,
  PlusIcon,
} from "@phosphor-icons/react";
import { cn } from "#lib/utils";
import { inkButton } from "./surfaces";

export interface ChatListTab {
  id: string;
  label: string;
}

export interface ChatListRow {
  id: string;
  title: string;
  /** Most recent message preview (user or assistant). */
  preview?: string;
  /** Last-updated label; always displayed, in both tabs. */
  updatedAt: string;
  /** Whether the row is archived; selects the row action affordance. */
  archived?: boolean;
}

export interface ChatListScreenProps {
  title: string;
  description?: string;
  newChatLabel: string;
  onNewChat?: () => void;
  tabs: readonly ChatListTab[];
  activeTabId: string;
  onTabChange?: (tabId: string) => void;
  rows?: readonly ChatListRow[];
  emptyTitle: string;
  emptyDescription: string;
  emptyActionLabel: string;
  onSelectRow?: (id: string) => void;
  /** Accessible label for the per-row archive action. */
  archiveRowLabel?: string;
  /** Accessible label for the per-row unarchive action. */
  unarchiveRowLabel?: string;
  onArchiveRow?: (id: string) => void | Promise<void>;
  onUnarchiveRow?: (id: string) => void | Promise<void>;
  className?: string;
}

const ChatListScreen = ({
  title,
  description,
  newChatLabel,
  onNewChat,
  tabs,
  activeTabId,
  onTabChange,
  rows = [],
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  onSelectRow,
  archiveRowLabel,
  unarchiveRowLabel,
  onArchiveRow,
  onUnarchiveRow,
  className,
  ...props
}: ChatListScreenProps & ComponentProps<"section">) => (
  <section
    data-slot="chat-list-screen"
    className={cn("flex min-h-0 flex-1 flex-col", className)}
    {...props}
  >
    <header className="flex items-start justify-between gap-4 px-6 pt-8 pb-6">
      <div className="max-w-xl space-y-2">
        <h1 className="text-foreground text-2xl font-semibold tracking-tight">
          {title}
        </h1>
        {description ? (
          <p className="text-muted-foreground text-sm leading-5">
            {description}
          </p>
        ) : null}
      </div>
      <button
        type="button"
        className={cn(
          inkButton,
          "flex h-9 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium",
        )}
        onClick={onNewChat}
      >
        <PlusIcon className="size-4" aria-hidden="true" />
        {newChatLabel}
      </button>
    </header>
    <div className="border-border flex items-end justify-between border-b px-6">
      <div role="tablist" className="flex items-center gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={tab.id === activeTabId}
            data-active={tab.id === activeTabId || undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2.5 text-sm transition-colors",
              tab.id === activeTabId
                ? "border-primary text-foreground font-medium"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
            onClick={onTabChange ? () => onTabChange(tab.id) : undefined}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
    <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
      <div className="bg-card overflow-hidden rounded-lg border">
        {rows.length === 0 ? (
          <div className="text-muted-foreground flex h-48 flex-col items-center justify-center gap-3 text-sm">
            <div className="text-foreground font-medium">{emptyTitle}</div>
            <div className="max-w-xs text-center">{emptyDescription}</div>
            {onNewChat ? (
              <button
                type="button"
                className="ring-primary text-primary hover:bg-primary/10 mt-1 rounded-lg px-3 py-1.5 text-sm font-medium ring-1 focus-visible:ring-2 focus-visible:outline-none"
                onClick={onNewChat}
              >
                {emptyActionLabel}
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li
                key={row.id}
                className="border-border/60 flex items-stretch gap-1"
              >
                <button
                  type="button"
                  className="hover:bg-muted/40 focus-visible:ring-ring flex w-full min-w-0 flex-1 flex-col gap-1 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  onClick={onSelectRow ? () => onSelectRow(row.id) : undefined}
                >
                  <span className="text-foreground truncate text-sm font-medium">
                    {row.title}
                  </span>
                  {row.preview ? (
                    <span className="text-muted-foreground truncate text-xs leading-5">
                      {row.preview}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground/80 text-xs">
                    {row.updatedAt}
                  </span>
                </button>
                {row.archived ? (
                  onUnarchiveRow ? (
                    <button
                      type="button"
                      aria-label={unarchiveRowLabel ?? "Unarchive"}
                      className="text-muted-foreground hover:text-foreground hover:bg-muted/40 focus-visible:ring-ring mx-2 my-2 flex shrink-0 items-center rounded-md px-2 focus-visible:outline-none focus-visible:ring-1"
                      onClick={() => {
                        void onUnarchiveRow(row.id);
                      }}
                    >
                      <ArrowCounterClockwise
                        className="size-4"
                        aria-hidden="true"
                      />
                    </button>
                  ) : null
                ) : onArchiveRow ? (
                  <button
                    type="button"
                    aria-label={archiveRowLabel ?? "Archive"}
                    className="text-muted-foreground hover:text-foreground hover:bg-muted/40 focus-visible:ring-ring mx-2 my-2 flex shrink-0 items-center rounded-md px-2 focus-visible:outline-none focus-visible:ring-1"
                    onClick={() => {
                      void onArchiveRow(row.id);
                    }}
                  >
                    <Archive className="size-4" aria-hidden="true" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  </section>
);

export { ChatListScreen };
