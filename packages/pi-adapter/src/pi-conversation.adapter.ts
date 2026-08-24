/**
 * Pi SDK-backed ConversationRunner implementation.
 *
 * Creates a Pi Agent per turn, wired to a Models runtime with an injected
 * Host-private credential store. Streaming text deltas are forwarded to the
 * onDelta callback; the final assistant text is returned.
 */
import { Agent } from "@earendil-works/pi-agent-core";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import type {
  AuthContext,
  CredentialStore,
  UserMessage,
} from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import {
  AgentTurnError,
  type AgentTurnInput,
  type AgentTurnResult,
  type ConversationRunner,
} from "./conversation.model.js";

export interface PiConversationConfig {
  /** Provider id, e.g. "anthropic" */
  provider: string;
  /** Model id within the provider, e.g. "claude-sonnet-4-20250514" */
  model: string;
  /** Host-private credential storage owned by the Pi Adapter boundary. */
  credentials: CredentialStore;
  /** Optional system prompt */
  systemPrompt?: string;
  /** Explicit auth context; defaults to denying ambient env/file credentials. */
  authContext?: AuthContext;
}

const noAmbientAuthContext: AuthContext = {
  env: async () => undefined,
  fileExists: async () => false,
};

export function createPiConversationRunner(
  config: PiConversationConfig,
): ConversationRunner {
  const models = builtinModels({
    credentials: config.credentials,
    authContext: config.authContext ?? noAmbientAuthContext,
  });

  return {
    async submitTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
      const model = models.getModel(config.provider, config.model);
      if (!model) {
        throw new AgentTurnError("agent_unavailable");
      }
      const auth = await models
        .checkAuth(config.provider)
        .catch(() => undefined);
      if (!auth) {
        throw new AgentTurnError("agent_unavailable");
      }

      const messages: UserMessage[] = [
        {
          role: "user",
          content: input.prompt,
          timestamp: Date.now(),
        },
      ];

      const agent = new Agent({
        streamFn: models.streamSimple.bind(models),
        initialState: {
          model,
          systemPrompt: config.systemPrompt ?? "",
          thinkingLevel: "off",
          messages,
        },
      });

      const textParts: string[] = [];

      return new Promise((resolve, reject) => {
        const unsubscribe = agent.subscribe((event: AgentEvent) => {
          switch (event.type) {
            case "message_update": {
              const msg = agent.state.messages.at(-1);
              if (msg?.role === "assistant" && Array.isArray(msg.content)) {
                const fullText = msg.content
                  .filter((c) => c.type === "text")
                  .map((c) => c.text)
                  .join("");
                const delta = fullText.slice(textParts.join("").length);
                if (delta.length > 0) {
                  textParts.push(delta);
                  input.onDelta?.({ kind: "assistant_text", text: delta });
                }
              }
              break;
            }
            case "agent_end": {
              unsubscribe();
              const lastMsg = agent.state.messages.at(-1);
              let assistantText = textParts.join("");
              if (
                lastMsg?.role === "assistant" &&
                Array.isArray(lastMsg.content)
              ) {
                assistantText = lastMsg.content
                  .filter((c) => c.type === "text")
                  .map((c) => c.text)
                  .join("");
              }
              resolve({ text: assistantText });
              break;
            }
          }
        });

        agent
          .prompt(input.prompt)
          .then(() => agent.waitForIdle())
          .catch(() => {
            unsubscribe();
            reject(new AgentTurnError("agent_turn_failed"));
          });
      });
    },
  };
}
