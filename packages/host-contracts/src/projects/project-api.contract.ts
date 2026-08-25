import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import { HostAuthorizationErrorSchemas } from "../authentication/host-authorization.schema.js";
import {
  ListProjectsResultSchema,
  RegisterProjectRequestSchema,
  RegisterProjectResultSchema,
} from "./project.schema.js";
import { ProjectCatalogErrorSchemas } from "./project-errors.schema.js";

export const ProjectAuthorizationHeaderSchema = Schema.Struct({
  authorization: Schema.optionalKey(Schema.String),
});

export const ProjectApiGroup = HttpApiGroup.make("projects")
  .add(
    HttpApiEndpoint.post("registerProject", "/projects", {
      headers: ProjectAuthorizationHeaderSchema,
      payload: RegisterProjectRequestSchema,
      success: RegisterProjectResultSchema,
      error: [...HostAuthorizationErrorSchemas, ...ProjectCatalogErrorSchemas],
    }),
  )
  .add(
    HttpApiEndpoint.get("listProjects", "/projects", {
      headers: ProjectAuthorizationHeaderSchema,
      success: ListProjectsResultSchema,
      error: [...HostAuthorizationErrorSchemas, ...ProjectCatalogErrorSchemas],
    }),
  );
