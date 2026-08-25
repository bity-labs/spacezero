import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

export const UnauthorizedErrorSchema = Schema.Struct({
  code: Schema.Literals(["unauthorized"]),
  message: Schema.String,
}).pipe(HttpApiSchema.status(401));
export const ForbiddenErrorSchema = Schema.Struct({
  code: Schema.Literals(["forbidden"]),
  message: Schema.String,
}).pipe(HttpApiSchema.status(403));
export const UnavailableErrorSchema = Schema.Struct({
  code: Schema.Literals(["unavailable"]),
  message: Schema.String,
}).pipe(HttpApiSchema.status(503));
export const HostAuthorizationErrorSchemas = [
  UnauthorizedErrorSchema,
  ForbiddenErrorSchema,
  UnavailableErrorSchema,
] as const;
export const HostAuthorizationErrorSchema = Schema.Union(
  HostAuthorizationErrorSchemas,
);
export interface HostAuthorizationError {
  readonly code: "unauthorized" | "forbidden" | "unavailable";
  readonly message: string;
}
export const authorizationError = (
  code: HostAuthorizationError["code"],
  message = code,
): HostAuthorizationError => ({ code, message });
