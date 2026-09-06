import { createFileRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

import { GlobalChatSessionDraftThread } from "../features/conversations/global-chat-draft-thread.js";

export const Route = createFileRoute("/global-chat-sessions/new")({
  component: GlobalChatSessionDraftRoute,
});

function GlobalChatSessionDraftRoute(): ReactElement {
  const { t } = useTranslation();

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-background"
      aria-label={t("conversations.newChatDraft")}
    >
      <header className="border-b border-border px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("conversations.globalChatSession")}
        </p>
        <h1 className="mt-1 truncate text-lg font-semibold tracking-tight">
          {t("workspace.newChat")}
        </h1>
      </header>
      <GlobalChatSessionDraftThread />
    </section>
  );
}
