import { createFileRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/global-chat-sessions/")({
  component: GlobalChatSessionsIndexRoute,
});

/**
 * Minimal All Chats placeholder route. The full All Chats screen (tabs, rows,
 * empty state) is implemented by the All Chats slice.
 */
function GlobalChatSessionsIndexRoute(): ReactElement {
  const { t } = useTranslation();

  return (
    <section
      className="flex min-h-0 flex-1 items-center justify-center p-8"
      aria-label={t("workspace.allChats")}
    >
      <h1 className="text-2xl font-semibold tracking-tight">
        {t("workspace.allChats")}
      </h1>
    </section>
  );
}
