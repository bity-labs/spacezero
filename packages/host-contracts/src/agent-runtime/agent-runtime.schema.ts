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

export interface AgentRuntimeDefaultModel {
  readonly providerId: string;
  readonly modelId: string;
}

export interface AgentRuntimeDefaults {
  readonly defaultModel: AgentRuntimeDefaultModel | null;
  readonly defaultThinkingLevel: AgentThinkingLevel | null;
}

export interface GetAgentRuntimeDefaultsResult {
  readonly defaults: AgentRuntimeDefaults;
}

export interface UpdateAgentRuntimeDefaultsRequest {
  readonly defaultModel?: AgentRuntimeDefaultModel;
  readonly defaultThinkingLevel?: AgentThinkingLevel;
}

export interface UpdateAgentRuntimeDefaultsResult {
  readonly defaults: AgentRuntimeDefaults;
}

export const AgentRuntimeDefaultModelSchema = Schema.Struct({
  providerId: Schema.String.check(
    Schema.isMinLength(1),
    Schema.isMaxLength(128),
  ),
  modelId: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256)),
});

export const AgentRuntimeDefaultsSchema = Schema.Struct({
  defaultModel: Schema.NullOr(AgentRuntimeDefaultModelSchema),
  defaultThinkingLevel: Schema.NullOr(AgentThinkingLevelSchema),
});

export const GetAgentRuntimeDefaultsResultSchema = Schema.Struct({
  defaults: AgentRuntimeDefaultsSchema,
});

export const UpdateAgentRuntimeDefaultsRequestSchema = Schema.Struct({
  defaultModel: Schema.optionalKey(AgentRuntimeDefaultModelSchema),
  defaultThinkingLevel: Schema.optionalKey(AgentThinkingLevelSchema),
});

export const UpdateAgentRuntimeDefaultsResultSchema = Schema.Struct({
  defaults: AgentRuntimeDefaultsSchema,
});
