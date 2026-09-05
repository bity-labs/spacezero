import type { AgentRuntimeErrorCode } from "@spacezero/host-contracts";

export class AgentRuntimeDefaultsServiceError extends Error {
  constructor(readonly code: AgentRuntimeErrorCode) {
    super(code);
  }
}
