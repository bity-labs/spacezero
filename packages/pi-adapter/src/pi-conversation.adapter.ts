/**
 * Pi SDK-backed ConversationRunner implementation.
 *
 * Creates a Pi Agent per turn, wired to a Models runtime with
 * provider-scoped API key auth. Streaming text deltas are forwarded
 * to the onDelta callback; the final assistant text is returned.
 */
import { Agent } from "@earendil-works/pi-agent-core";
import type { AgentEvent } from "@earendil-works/pi-agent-core";
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type { UserMessage } from "@earendil-works/pi-ai";
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
  /** API key for the provider */
  apiKey: string;
  /** Optional system prompt */
  systemPrompt?: string;
}

export function createPiConversationRunner(
  config: PiConversationConfig,
): ConversationRunner {
  const credentials = new InMemoryCredentialStore();
  const models = builtinModels({ credentials });

  // Pre-populate the credential store with the API key so auth resolution succeeds.
  const credentialPromise = credentials.modify(config.provider, async () => ({
    type: "api_key" as const,
    key: config.apiKey,
  }));

  return {
    async submitTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
      await credentialPromise;

      const model = models.getModel(config.provider, config.model);
      if (!model) {
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
