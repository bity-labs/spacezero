import { Schema } from "effect";

export type AgentThinkingLevel =
  "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export interface AgentModelDescriptor {
  readonly providerId: string;
  readonly providerDisplayName: string;
  readonly modelId: string;
  readonly displayName: string;
  readonly authenticated: boolean;
  readonly available: boolean;
  readonly reasoningSupported: boolean;
  readonly supportedThinkingLevels: readonly AgentThinkingLevel[];
  readonly contextWindow?: number;
  readonly maxTokens?: number;
}

export interface ListAgentRuntimeModelsResult {
  readonly models: readonly AgentModelDescriptor[];
}

export const AgentThinkingLevelSchema = Schema.Literals([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

export const AgentModelDescriptorSchema = Schema.Struct({
  providerId: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(128),
  ),
  providerDisplayName: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(256),
  ),
  modelId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
  displayName: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(256),
  ),
  authenticated: Schema.Boolean,
  available: Schema.Boolean,
  reasoningSupported: Schema.Boolean,
  supportedThinkingLevels: Schema.Array(AgentThinkingLevelSchema),
  contextWindow: Schema.optionalKey(
    Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
  ),
  maxTokens: Schema.optionalKey(
    Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
  ),
});

export const ListAgentRuntimeModelsResultSchema = Schema.Struct({
  models: Schema.Array(AgentModelDescriptorSchema),
});
