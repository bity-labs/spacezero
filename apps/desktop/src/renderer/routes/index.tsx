import { createFileRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";

export const Route = createFileRoute("/")({
  component: IndexRoute,
});

function IndexRoute(): ReactElement {
  return (
    <section className="flex min-h-0 flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome to Space Zero</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Select a workspace area from the sidebar to begin wiring the desktop surfaces.
        </p>
      </div>
    </section>
  );
}
