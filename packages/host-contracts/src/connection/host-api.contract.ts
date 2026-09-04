import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
} from "effect/unstable/httpapi";
import { OpenApi } from "effect/unstable/httpapi";
import { Schema } from "effect";
import {
  HostAuthorizationErrorSchema,
  HostAuthorizationErrorSchemas,
} from "../authentication/host-authorization.schema.js";
import { LocalHostBootstrapResultSchema } from "../local-host/local-host-startup.schema.js";
import {
  HostConnectedEventSchema,
  HostConnectionDescriptorSchema,
  HostConnectionSnapshotSchema,
} from "./host-connection.schema.js";
import { AgentResourcesApiGroup } from "../agent-resources/agent-resources-api.contract.js";
import { AgentRuntimeApiGroup } from "../agent-runtime/agent-runtime-api.contract.js";
import { FlowApiGroup } from "../flows/flow-api.contract.js";
import { GlobalChatSessionApiGroup } from "../global-chat-sessions/global-chat-session-api.contract.js";
import { HarnessAuthApiGroup } from "../harness-auth/harness-auth-api.contract.js";
import { ProjectApiGroup } from "../projects/project-api.contract.js";
import { ProjectSessionApiGroup } from "../project-sessions/project-session-api.contract.js";

export const AuthorizationHeaderSchema = Schema.Struct({
  authorization: Schema.optionalKey(Schema.String),
});
export const ClientAuthorizationHeaderSchema = AuthorizationHeaderSchema;
export const OptionalOriginAuthorizationHeaderSchema =
  AuthorizationHeaderSchema;
export const HostSseSuccess = HttpApiSchema.StreamSse({
  data: HostConnectedEventSchema,
  error: HostAuthorizationErrorSchema,
});
export const HostBootstrapGroup = HttpApiGroup.make("bootstrap").add(
  HttpApiEndpoint.post("bootstrapSupervisor", "/bootstrap", {
    headers: AuthorizationHeaderSchema,
    success: LocalHostBootstrapResultSchema,
    error: HostAuthorizationErrorSchemas,
  }),
);
export const HostConnectionGroup = HttpApiGroup.make("connection")
  .add(
    HttpApiEndpoint.get("connection", "/connection", {
      headers: ClientAuthorizationHeaderSchema,
      success: HostConnectionSnapshotSchema,
      error: HostAuthorizationErrorSchemas,
    }),
  )
  .add(
    HttpApiEndpoint.get("events", "/events", {
      headers: ClientAuthorizationHeaderSchema,
      success: HostSseSuccess,
      error: HostAuthorizationErrorSchemas,
    }),
  );
export const HostAdminGroup = HttpApiGroup.make("admin")
  .add(
    HttpApiEndpoint.post("mintClientCapability", "/admin/client-capabilities", {
      headers: OptionalOriginAuthorizationHeaderSchema,
      success: HostConnectionDescriptorSchema,
      error: HostAuthorizationErrorSchemas,
    }),
  )
  .add(
    HttpApiEndpoint.post("shutdown", "/admin/shutdown", {
      headers: OptionalOriginAuthorizationHeaderSchema,
      success: Schema.Struct({ ok: Schema.Boolean }),
      error: HostAuthorizationErrorSchemas,
    }),
  );
export const HostApi = HttpApi.make("SpaceZeroHostApi")
  .add(HostBootstrapGroup)
  .add(HostConnectionGroup)
  .add(HostAdminGroup)
  .add(HarnessAuthApiGroup)
  .add(AgentRuntimeApiGroup)
  .add(AgentResourcesApiGroup)
  .add(FlowApiGroup)
  .add(GlobalChatSessionApiGroup)
  .add(ProjectApiGroup)
  .add(ProjectSessionApiGroup)
  .prefix("/v1");
export const HostOpenApi = OpenApi.fromApi(HostApi);
