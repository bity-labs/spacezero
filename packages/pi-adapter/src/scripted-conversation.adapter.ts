import {
  AgentTurnError,
  type AgentTurnAssistantMessage,
  type AgentTurnContentPart,
  type AgentTurnInput,
  type ConversationRunner,
} from "./conversation.model.js";

export interface ScriptedConversationOptions {
  /**
   * Deterministic turn script. Defaults to echoing the prompt so Host flows
   * stay testable before the real Pi SDK runner is introduced.
   */
  readonly respond?: (input: AgentTurnInput) =>
    | string
    | {
        readonly text: string;
        readonly parts?: readonly AgentTurnContentPart[];
        readonly messages?: readonly AgentTurnAssistantMessage[];
      }
    | Promise<
        | string
        | {
            readonly text: string;
            readonly parts?: readonly AgentTurnContentPart[];
            readonly messages?: readonly AgentTurnAssistantMessage[];
          }
      >;
  /** Typed failure raised before any turn output is produced. */
  readonly error?: AgentTurnError;
}

/**
 * Deterministic `ConversationRunner` used by Host tests and by the initial
 * Local Host until the authenticated Pi SDK runner replaces it. It emits one
 * ephemeral assistant text delta and then completes the message boundary.
 */
export const createScriptedConversationRunner = (
  options: ScriptedConversationOptions = {},
): ConversationRunner => ({
  submitTurn: async (input) => {
    if (input.signal?.aborted)
      throw new AgentTurnError("agent_turn_interrupted");
    if (options.error) throw options.error;
    const respond = options.respond ?? ((current) => `Echo: ${current.prompt}`);
    const response = await respond(input);
    const result = typeof response === "string" ? { text: response } : response;
    const messages = result.messages ?? [result];
    const parts = result.parts ??
      messages[0]?.parts ?? [
        { type: "text" as const, order: 1, text: result.text },
      ];
    if (input.signal?.aborted)
      throw new AgentTurnError("agent_turn_interrupted");
    for (const [messageIndex, message] of messages.entries()) {
      const messageParts = message.parts ?? [
        { type: "text" as const, order: 1, text: message.text },
      ];
      for (const part of messageParts) {
        if (part.type !== "text" && part.type !== "reasoning") continue;
        input.onDelta?.({
          kind: "assistant_content",
          part,
          ...(messageIndex === 0 ? {} : { messageIndex }),
        });
        await input.onEvent?.({
          type: "assistant_delta",
          part,
          ...(messageIndex === 0 ? {} : { messageIndex }),
        });
      }
    }
    return result.messages === undefined
      ? { text: result.text, parts }
      : { text: result.text, parts, messages };
  },
});
