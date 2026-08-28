import { createLocalHostConnectionClient } from "@spacezero/client-runtime";
import { useEffect, type ReactElement } from "react";

/**
 * Blank application shell. The renderer UI is intentionally empty; features
 * will be built on top of this root. Host connection state is exposed on the
 * document element for tooling while the UI is being rebuilt.
 */
export const App = (): ReactElement => {
  useEffect(() => {
    let mounted = true;
    const client = createLocalHostConnectionClient({
      acquireDescriptor: window.spacezero.getLocalHostConnection,
    });
    client.connect().then(
      () => {
        if (mounted) document.documentElement.dataset.hostStatus = "connected";
      },
      () => {
        if (mounted)
          document.documentElement.dataset.hostStatus = "unavailable";
      },
    );
    return () => {
      mounted = false;
      client.dispose();
    };
  }, []);
  return <main className="app-root" />;
};
