"use client";

import { useRef, useState, type ComponentProps } from "react";
import { CaretDownIcon, PencilIcon } from "@phosphor-icons/react";
import { cn } from "#lib/utils";
import { floating } from "./surfaces";

export interface ChatBreadcrumbEntry {
  id: string;
  title: string;
}

export interface ChatBreadcrumbProps {
  /** Leading breadcrumb section, e.g. "Chats"; clicking navigates to the list. */
  sectionLabel: string;
  onSectionClick?: () => void;
  /** Current chat title shown in the trigger. */
  chatTitle: string;
  /** Known chats for quick switching; the active one is badged CURRENT. */
  chats?: readonly ChatBreadcrumbEntry[];
  activeChatId?: string;
  currentBadgeLabel?: string;
  onSelectChat?: (id: string) => void;
  renameLabel?: string;
  onRename?: (title: string) => void;
  /** Open the quick-switch menu on first render (demo/tests). */
  defaultMenuOpen?: boolean;
  /** Start in edit mode on first render (demo/tests). */
  defaultEditing?: boolean;
  className?: string;
}

const ChatBreadcrumb = ({
  sectionLabel,
  onSectionClick,
  chatTitle,
  chats = [],
  activeChatId,
  currentBadgeLabel = "CURRENT",
  onSelectChat,
  renameLabel = "Rename chat",
  onRename,
  defaultMenuOpen = false,
  defaultEditing = false,
  className,
  ...props
}: ChatBreadcrumbProps & ComponentProps<"nav">) => {
  const [menuOpen, setMenuOpen] = useState(defaultMenuOpen);
  const [editing, setEditing] = useState(defaultEditing);
  const [draft, setDraft] = useState(chatTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setDraft(chatTitle);
    setEditing(true);
  };

  const submitRename = () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed.length > 0 && trimmed !== chatTitle) onRename?.(trimmed);
  };

  return (
    <nav
      data-slot="chat-breadcrumb"
      aria-label={sectionLabel}
      className={cn(
        "text-muted-foreground flex items-center gap-2 text-sm",
        className,
      )}
      {...props}
    >
      <button
        type="button"
        className="hover:text-foreground rounded px-1 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        onClick={onSectionClick}
      >
        {sectionLabel}
      </button>
      <span aria-hidden="true">›</span>
      <div className="relative flex items-center gap-0.5">
        {editing ? (
          <input
            ref={inputRef}
            autoFocus
            onFocus={(event) => event.target.select()}
            value={draft}
            aria-label={renameLabel}
            className="text-foreground h-7 w-56 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.defaultPrevented || event.nativeEvent.isComposing)
                return;
              if (event.key === "Enter") {
                event.preventDefault();
                submitRename();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                setEditing(false);
              }
            }}
            onBlur={submitRename}
          />
        ) : (
          <>
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              data-open={menuOpen || undefined}
              className="text-foreground hover:bg-foreground/[0.06] dark:hover:bg-foreground/[0.09] flex h-7 items-center gap-1 rounded-md px-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="max-w-64 truncate">{chatTitle}</span>
              {chats.length > 0 ? (
                <CaretDownIcon
                  className="size-3 opacity-60"
                  aria-hidden="true"
                />
              ) : null}
            </button>
            {onRename ? (
              <button
                type="button"
                aria-label={renameLabel}
                className="hover:bg-foreground/[0.06] dark:hover:bg-foreground/[0.09] text-muted-foreground hover:text-foreground flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                onClick={startEditing}
              >
                <PencilIcon className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
            {menuOpen && chats.length > 0 ? (
              <div
                role="menu"
                aria-label={sectionLabel}
                className={cn(
                  floating,
                  "absolute top-full left-0 z-10 mt-1.5 flex min-w-56 flex-col gap-0.5 rounded-2xl p-1.5",
                )}
              >
                {chats.map((chat) => {
                  const active = chat.id === activeChatId;
                  return (
                    <button
                      key={chat.id}
                      role="menuitem"
                      type="button"
                      data-active={active || undefined}
                      className={cn(
                        "flex items-center justify-between gap-6 rounded-[10px] px-2.5 py-2 text-[13.5px] transition-colors",
                        active
                          ? "bg-foreground/[0.08]"
                          : "hover:bg-foreground/[0.04]",
                      )}
                      onClick={() => {
                        setMenuOpen(false);
                        if (!active) onSelectChat?.(chat.id);
                      }}
                    >
                      <span className="truncate">{chat.title}</span>
                      {active ? (
                        <span className="text-foreground/45 shrink-0 font-mono text-[10px] tracking-wide">
                          {currentBadgeLabel}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </>
        )}
      </div>
    </nav>
  );
};

export { ChatBreadcrumb };
