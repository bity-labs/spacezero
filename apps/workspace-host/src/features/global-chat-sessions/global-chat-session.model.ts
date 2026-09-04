import type { GlobalChatSessionErrorCode } from "@spacezero/host-contracts";

export class GlobalChatSessionServiceError extends Error {
  constructor(readonly code: GlobalChatSessionErrorCode) {
    super(code);
  }
}

export type GlobalChatSessionTurnFailureReason =
  | "agent_configuration_invalid"
  | "agent_unavailable"
  | "agent_turn_failed"
  | "agent_authentication_required";

export type GlobalChatSessionTurnInterruptReason =
  | "user_interrupted"
  | "host_shutdown";
