import { DatabaseSync } from "node:sqlite";

export interface SeedAgentRuntimeDefaultsInput {
  readonly providerId: string;
  readonly modelId: string;
  readonly defaultThinkingLevel:
    | "off"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max";
}

export const seedAgentRuntimeDefaults = (
  databasePath: string,
  input: SeedAgentRuntimeDefaultsInput = {
    providerId: "anthropic",
    modelId: "claude-sonnet-4-5",
    defaultThinkingLevel: "off",
  },
): void => {
  const db = new DatabaseSync(databasePath);
  try {
    db.prepare(
      `INSERT INTO agent_runtime_defaults (singleton, default_provider_id, default_model_id, default_thinking_level, updated_at)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(singleton) DO UPDATE SET
         default_provider_id = excluded.default_provider_id,
         default_model_id = excluded.default_model_id,
         default_thinking_level = excluded.default_thinking_level,
         updated_at = excluded.updated_at`,
    ).run(
      input.providerId,
      input.modelId,
      input.defaultThinkingLevel,
      new Date().toISOString(),
    );
  } finally {
    db.close();
  }
};
