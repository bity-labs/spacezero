import type { GlobalChatSessionErrorCode } from "@spacezero/host-contracts";

export class GlobalChatSessionServiceError extends Error {
  constructor(readonly code: GlobalChatSessionErrorCode) {
    super(code);
  }
}
