import { createLocalHostConnectionClient } from "@spacezero/client-runtime";
import type { ProjectSessionSummary } from "@spacezero/host-contracts";
import { useCallback, useEffect, useState, type ReactElement } from "react";
import { ProjectsContainer } from "./features/projects/projects-container.js";
import { SessionChatContainer } from "./features/session-chat/session-chat-container.js";

export const App = (): ReactElement => {
  const [version, setVersion] = useState("loading");
  const [hostStatus, setHostStatus] = useState<
    "connecting" | "connected" | "unavailable"
  >("connecting");
  const [openSession, setOpenSession] = useState<ProjectSessionSummary | null>(
    null,
  );
  useEffect(() => {
    let mounted = true;
    window.spacezero.getAppVersion().then((value) => {
      if (mounted) setVersion(value);
    });
    const client = createLocalHostConnectionClient({
      acquireDescriptor: window.spacezero.getLocalHostConnection,
    });
    client.connect().then(
      () => {
        if (mounted) setHostStatus("connected");
      },
      () => {
        if (mounted) setHostStatus("unavailable");
      },
    );
    return () => {
      mounted = false;
      client.dispose();
    };
  }, []);
  const closeSession = useCallback(() => setOpenSession(null), []);
  return (
    <main className="shell" aria-labelledby="app-title">
      <p className="eyebrow">Authenticated connectivity tracer</p>
      <h1 id="app-title">Space Zero</h1>
      <dl>
        <div>
          <dt>Desktop version</dt>
          <dd>{version}</dd>
        </div>
        <div>
          <dt>Local Host</dt>
          <dd>{hostStatus}</dd>
        </div>
      </dl>
      {hostStatus === "connected" ? (
        openSession ? (
          <SessionChatContainer session={openSession} onBack={closeSession} />
        ) : (
          <ProjectsContainer onOpenSession={setOpenSession} />
        )
      ) : null}
    </main>
  );
};
