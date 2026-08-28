import { createFileRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";

export const Route = createFileRoute("/")({
  component: IndexRoute,
});

function IndexRoute(): ReactElement {
  return <main className="app-root" />;
}
