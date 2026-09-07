import { Schema } from "effect";
import { GlobalChatSessionIdSchema } from "../global-chat-sessions/global-chat-session.schema.js";
import { ProjectSessionIdSchema } from "../project-sessions/project-session.schema.js";

export type AgentResourceScope =
  "project_agents" | "project_pi" | "spacezero_home" | "user_agents";

export type AgentResourceDiagnosticCode =
  | "project_trust_required"
  | "skill_malformed"
  | "skill_too_large"
  | "skill_collision"
  | "skill_symlink_escape";

export interface AgentSkillDescriptor {
  readonly name: string;
  readonly description: string;
  readonly scope: AgentResourceScope;
  readonly digest: string;
  readonly enabled: boolean;
  readonly trusted: boolean;
}

export interface AgentResourceDiagnostic {
  readonly code: AgentResourceDiagnosticCode;
  readonly scope: AgentResourceScope;
  readonly name?: string;
  readonly message: string;
}

export interface ListProjectSessionSkillsResult {
  readonly sessionId: string;
  readonly skills: readonly AgentSkillDescriptor[];
  readonly diagnostics: readonly AgentResourceDiagnostic[];
}

export interface ListGlobalChatSessionSkillsResult {
  readonly sessionId: string;
  readonly skills: readonly AgentSkillDescriptor[];
  readonly diagnostics: readonly AgentResourceDiagnostic[];
}

export const AgentResourceScopeSchema = Schema.Literals([
  "project_agents",
  "project_pi",
  "spacezero_home",
  "user_agents",
]);
export const AgentResourceDiagnosticCodeSchema = Schema.Literals([
  "project_trust_required",
  "skill_malformed",
  "skill_too_large",
  "skill_collision",
  "skill_symlink_escape",
]);
export const AgentSkillDescriptorSchema = Schema.Struct({
  name: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(128)),
  description: Schema.String.check(Schema.isMaxLength(1_000)),
  scope: AgentResourceScopeSchema,
  digest: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
  enabled: Schema.Boolean,
  trusted: Schema.Boolean,
});
export const AgentResourceDiagnosticSchema = Schema.Struct({
  code: AgentResourceDiagnosticCodeSchema,
  scope: AgentResourceScopeSchema,
  name: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(128))),
  message: Schema.String.check(Schema.isMaxLength(1_000)),
});
export const ListProjectSessionSkillsResultSchema = Schema.Struct({
  sessionId: ProjectSessionIdSchema,
  skills: Schema.Array(AgentSkillDescriptorSchema),
  diagnostics: Schema.Array(AgentResourceDiagnosticSchema),
});

export const ListGlobalChatSessionSkillsResultSchema = Schema.Struct({
  sessionId: GlobalChatSessionIdSchema,
  skills: Schema.Array(AgentSkillDescriptorSchema),
  diagnostics: Schema.Array(AgentResourceDiagnosticSchema),
});

export const parseListProjectSessionSkillsResult = Schema.decodeUnknownSync(
  ListProjectSessionSkillsResultSchema,
);

export const parseListGlobalChatSessionSkillsResult = Schema.decodeUnknownSync(
  ListGlobalChatSessionSkillsResultSchema,
);
