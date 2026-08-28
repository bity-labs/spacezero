import { createRootRoute, Outlet } from "@tanstack/react-router";
import type { ReactElement } from "react";

export const Route = createRootRoute({
  component: RootRoute,
});

function RootRoute(): ReactElement {
  return (
    <div className="app-shell">
      <header className="window-titlebar" aria-label="Window title bar">
        <span className="window-titlebar-label">Drag region</span>
      </header>
      <main className="app-root">
        <Outlet />
      </main>
    </div>
  );
}
