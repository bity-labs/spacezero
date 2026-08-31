import { createFileRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";

import { AgentCapabilitiesPage } from "../features/agent-capabilities/agent-capabilities-page";

export const Route = createFileRoute("/agent-capabilities")({
  component: AgentCapabilitiesRoute,
});

function AgentCapabilitiesRoute(): ReactElement {
  return <AgentCapabilitiesPage />;
}
