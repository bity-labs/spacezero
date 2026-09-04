import type {
  CreateGlobalChatSessionWithFirstPromptRequest,
  CreateGlobalChatSessionWithFirstPromptResult,
} from "@spacezero/host-contracts";
import { GlobalChatSessionServiceError } from "./global-chat-session.model.js";
import { createGlobalChatSessionRepository } from "./global-chat-session.repository.js";

export interface GlobalChatSessionService {
  readonly createWithFirstPrompt: (
    input: CreateGlobalChatSessionWithFirstPromptRequest,
  ) => Promise<CreateGlobalChatSessionWithFirstPromptResult>;
}

const mapError = (error: unknown): GlobalChatSessionServiceError => {
  if (error instanceof GlobalChatSessionServiceError) return error;
  return new GlobalChatSessionServiceError("global_chat_session_unavailable");
};

export const createGlobalChatSessionService = (options: {
  readonly databasePath: string;
}): GlobalChatSessionService => {
  const repository = createGlobalChatSessionRepository(options);

  return {
    createWithFirstPrompt: async (input) => {
      try {
        return await repository.createWithFirstPrompt(input);
      } catch (error) {
        throw mapError(error);
      }
    },
  };
};
