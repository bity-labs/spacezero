import { createLocalHostConnectionClient } from "@spacezero/client-runtime";
import { useEffect, useState, type ReactElement } from "react";

export const App = (): ReactElement => {
  const [version, setVersion] = useState("loading");
  const [hostStatus, setHostStatus] = useState<
    "connecting" | "connected" | "unavailable"
  >("connecting");
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
    </main>
  );
};
