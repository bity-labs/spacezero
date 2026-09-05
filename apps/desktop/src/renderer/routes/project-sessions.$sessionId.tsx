import { createFileRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

import { ProjectSessionSavedConversationThread } from "../features/conversations/saved-conversation-thread.js";

export const Route = createFileRoute("/project-sessions/$sessionId")({
  component: ProjectSessionRoute,
});

function ProjectSessionRoute(): ReactElement {
  const { t } = useTranslation();
  const { sessionId } = Route.useParams();

  return (
    <section
      className="flex min-h-0 flex-1 flex-col bg-background"
      aria-label={t("conversations.projectSessionSurface")}
    >
      <header className="border-b border-border px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("conversations.projectSession")}
        </p>
        <h1 className="mt-1 truncate text-lg font-semibold tracking-tight">
          {sessionId}
        </h1>
      </header>
      <ProjectSessionSavedConversationThread sessionId={sessionId} />
    </section>
  );
}
