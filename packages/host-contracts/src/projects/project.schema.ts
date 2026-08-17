import { Schema } from "effect";

export type ProjectId = string;
export type ProjectCommandId = string;

export interface ProjectSummary {
  readonly id: ProjectId;
  readonly displayName: string;
  readonly canonicalPath: string;
  readonly registeredHeadCommit: string;
  readonly createdAt: string;
}

export interface RegisterProjectRequest {
  readonly commandId: ProjectCommandId;
  readonly path: string;
}

export interface RegisterProjectResult {
  readonly outcome: "registered" | "existing";
  readonly project: ProjectSummary;
}

export interface ListProjectsResult {
  readonly projects: readonly ProjectSummary[];
}

const DateTimeUtcStringSchema = Schema.String.check(
  Schema.makeFilter((value: string) => {
    const millis = Date.parse(value);
    return Number.isFinite(millis) && new Date(millis).toISOString() === value;
  }),
);

export const ProjectIdSchema = Schema.String.check(Schema.isUUID());
export const ProjectCommandIdSchema = Schema.String.check(Schema.isUUID());
export const ProjectDisplayNameSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.makeFilter((value: string) => [...value].length <= 255),
);
const utf8ByteLength = (value: string): number => {
  let bytes = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0)!;
    if (codePoint <= 0x7f) bytes += 1;
    else if (codePoint <= 0x7ff) bytes += 2;
    else if (codePoint <= 0xffff) bytes += 3;
    else bytes += 4;
  }
  return bytes;
};

export const ProjectPathSchema = Schema.String.check(
  Schema.isMinLength(1),
  Schema.makeFilter((value: string) => !value.includes("\0")),
  Schema.makeFilter((value: string) => utf8ByteLength(value) <= 4096),
);
export const GitCommitObjectIdSchema = Schema.String.check(
  Schema.isPattern(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/),
);

export const ProjectSummarySchema = Schema.Struct({
  id: ProjectIdSchema,
  displayName: ProjectDisplayNameSchema,
  canonicalPath: ProjectPathSchema,
  registeredHeadCommit: GitCommitObjectIdSchema,
  createdAt: DateTimeUtcStringSchema,
});

export const RegisterProjectRequestSchema = Schema.Struct({
  commandId: ProjectCommandIdSchema,
  path: ProjectPathSchema,
});

export const RegisterProjectResultSchema = Schema.Struct({
  outcome: Schema.Literals(["registered", "existing"]),
  project: ProjectSummarySchema,
});

export const ListProjectsResultSchema = Schema.Struct({
  projects: Schema.Array(ProjectSummarySchema),
});
