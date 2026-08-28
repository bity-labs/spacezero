import { createLocalHostConnectionClient } from "@spacezero/client-runtime";
import { RouterProvider } from "@tanstack/react-router";
import { useEffect, type ReactElement } from "react";

import { router } from "./router.js";

/**
 * Application shell hosting the router. Feature screens are registered as
 * file-based routes under `src/renderer/routes/`.
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
  return <RouterProvider router={router} />;
};
