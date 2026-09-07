import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, type ReactElement } from "react";
import { useTranslation } from "react-i18next";

import { ChatBreadcrumb } from "@spacezero/ui/components/assistant-ui/elements/chat-breadcrumb";

import { useWorkspaceTitlebarCenter } from "../components/workspace-titlebar-context.js";
import { GlobalChatSessionDraftThread } from "../features/conversations/global-chat-draft-thread.js";

export const Route = createFileRoute("/global-chat-sessions/new")({
  component: GlobalChatSessionDraftRoute,
});

function GlobalChatSessionDraftRoute(): ReactElement {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const titlebarContent = useMemo(
    () => (
      <ChatBreadcrumb
        sectionLabel={t("workspace.chats")}
        onSectionClick={() => {
          void navigate({ to: "/global-chat-sessions" });
        }}
        chatTitle={t("workspace.newChat")}
      />
    ),
    [navigate, t],
  );
  useWorkspaceTitlebarCenter(titlebarContent);

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-background"
      aria-label={t("conversations.newChatDraft")}
    >
      <h1 className="sr-only">{t("workspace.newChat")}</h1>
      <GlobalChatSessionDraftThread />
    </section>
  );
}
