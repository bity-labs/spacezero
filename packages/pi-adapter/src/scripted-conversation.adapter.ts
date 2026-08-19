import type {
  AgentTurnError,
  AgentTurnInput,
  ConversationRunner,
} from "./conversation.model.js";

export interface ScriptedConversationOptions {
  /**
   * Deterministic turn script. Defaults to echoing the prompt so Host flows
   * stay testable before the real Pi SDK runner is introduced.
   */
  readonly respond?: (input: AgentTurnInput) => string | Promise<string>;
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
    if (options.error) throw options.error;
    const respond = options.respond ?? ((current) => `Echo: ${current.prompt}`);
    const text = await respond(input);
    input.onDelta?.({ kind: "assistant_text", text });
    return { text };
  },
});
