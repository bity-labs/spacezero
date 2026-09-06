import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createGlobalChatSessionClient } from "@spacezero/client-runtime";
import { useMemo, type ReactElement } from "react";

import { AllChatsScreen } from "../features/conversations/all-chats-screen.js";

export const Route = createFileRoute("/global-chat-sessions/")({
  component: GlobalChatSessionsIndexRoute,
});

/**
 * All Chats screen: Global Chat Sessions in Unarchived and Archived tabs,
 * loaded through the Client Runtime over the authenticated Host Protocol.
 */
function GlobalChatSessionsIndexRoute(): ReactElement {
  const navigate = useNavigate();
  const client = useMemo(
    () =>
      createGlobalChatSessionClient({
        getConnectionDescriptor: window.spacezero.getLocalHostConnection,
      }),
    [],
  );

  return (
    <AllChatsScreen
      client={client}
      onNewChat={() => {
        void navigate({ to: "/global-chat-sessions/new" });
      }}
      onSelectSession={(sessionId) => {
        void navigate({
          to: "/global-chat-sessions/$sessionId",
          params: { sessionId },
        });
      }}
    />
  );
}
