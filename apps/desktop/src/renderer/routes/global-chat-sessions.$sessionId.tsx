import { createFileRoute } from "@tanstack/react-router";

import { GlobalChatSessionSurface } from "../features/conversations/global-chat-session-surface.js";

export const Route = createFileRoute("/global-chat-sessions/$sessionId")({
  component: GlobalChatSessionRoute,
});

function GlobalChatSessionRoute() {
  const { sessionId } = Route.useParams();

  return <GlobalChatSessionSurface sessionId={sessionId} />;
}
