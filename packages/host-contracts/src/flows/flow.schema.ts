import { Schema } from "effect";
import {
  isValidHarnessProviderId,
  ProviderAuthStatusSchema,
  type ProviderAuthStatus,
} from "../harness-auth/harness-auth.schema.js";

export type FlowPromptType = "text" | "secret" | "select" | "manual_code";
export type FlowEventType =
  | "flow.started"
  | "flow.info"
  | "flow.external_url"
  | "flow.device_code"
  | "flow.progress"
  | "flow.prompt"
  | "flow.completed"
  | "flow.failed"
  | "flow.cancelled";

export interface FlowPromptOption {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
}

export type FlowEvent =
  | { readonly type: "flow.started" }
  | {
      readonly type: "flow.info";
      readonly message: string;
      readonly links?: readonly {
        readonly url: string;
        readonly label?: string;
      }[];
    }
  | {
      readonly type: "flow.external_url";
      readonly url: string;
      readonly instructions?: string;
    }
  | {
      readonly type: "flow.device_code";
      readonly userCode: string;
      readonly verificationUri: string;
      readonly intervalSeconds?: number;
      readonly expiresInSeconds?: number;
    }
  | { readonly type: "flow.progress"; readonly message: string }
  | {
      readonly type: "flow.prompt";
      readonly promptId: string;
      readonly promptType: FlowPromptType;
      readonly message: string;
      readonly placeholder?: string;
      readonly options?: readonly FlowPromptOption[];
    }
  | {
      readonly type: "flow.completed";
      readonly status?: ProviderAuthStatus;
    }
  | { readonly type: "flow.failed"; readonly reason: string }
  | { readonly type: "flow.cancelled" };

export interface FlowEventEnvelope {
  readonly flowId: string;
  readonly sequence: number;
  readonly event: FlowEvent;
}

export interface FlowEventStreamQuery {
  readonly after?: number;
}

export interface FlowPromptResponseRequest {
  readonly response: string;
}

export interface FlowCancelResult {
  readonly status: "cancelled";
}

export const FlowIdSchema = Schema.String;
export const FlowPromptIdSchema = Schema.String;
export const FlowPathParamsSchema = Schema.Struct({ flowId: FlowIdSchema });
export const FlowPromptPathParamsSchema = Schema.Struct({
  flowId: FlowIdSchema,
  promptId: FlowPromptIdSchema,
});
export const FlowEventStreamQuerySchema = Schema.Struct({
  after: Schema.optionalKey(
    Schema.NumberFromString.pipe(
      Schema.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
    ),
  ),
});
export const FlowPromptOptionSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  description: Schema.optionalKey(Schema.String),
});
export const FlowPromptTypeSchema = Schema.Literals([
  "text",
  "secret",
  "select",
  "manual_code",
]);
export const FlowEventSchema = Schema.Union([
  Schema.Struct({ type: Schema.Literals(["flow.started"]) }),
  Schema.Struct({
    type: Schema.Literals(["flow.info"]),
    message: Schema.String,
    links: Schema.optionalKey(
      Schema.Array(
        Schema.Struct({
          url: Schema.String,
          label: Schema.optionalKey(Schema.String),
        }),
      ),
    ),
  }),
  Schema.Struct({
    type: Schema.Literals(["flow.external_url"]),
    url: Schema.String,
    instructions: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literals(["flow.device_code"]),
    userCode: Schema.String,
    verificationUri: Schema.String,
    intervalSeconds: Schema.optionalKey(Schema.Number),
    expiresInSeconds: Schema.optionalKey(Schema.Number),
  }),
  Schema.Struct({
    type: Schema.Literals(["flow.progress"]),
    message: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literals(["flow.prompt"]),
    promptId: FlowPromptIdSchema,
    promptType: FlowPromptTypeSchema,
    message: Schema.String,
    placeholder: Schema.optionalKey(Schema.String),
    options: Schema.optionalKey(Schema.Array(FlowPromptOptionSchema)),
  }),
  Schema.Struct({
    type: Schema.Literals(["flow.completed"]),
    status: Schema.optionalKey(ProviderAuthStatusSchema),
  }),
  Schema.Struct({
    type: Schema.Literals(["flow.failed"]),
    reason: Schema.String,
  }),
  Schema.Struct({ type: Schema.Literals(["flow.cancelled"]) }),
]);
export const FlowEventEnvelopeSchema = Schema.Struct({
  flowId: FlowIdSchema,
  sequence: Schema.Number,
  event: FlowEventSchema,
});
export const FlowPromptResponseRequestSchema = Schema.Struct({
  response: Schema.String,
});
export const FlowCancelResultSchema = Schema.Struct({
  status: Schema.Literals(["cancelled"]),
});

const MAX_ID_BYTES = 128;
const MAX_TEXT_BYTES = 16 * 1024;
const exactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean =>
  Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const byteLength = (value: string): number => {
  let bytes = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0) ?? 0;
    bytes +=
      codePoint <= 0x7f
        ? 1
        : codePoint <= 0x7ff
          ? 2
          : codePoint <= 0xffff
            ? 3
            : 4;
  }
  return bytes;
};
const isValidId = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length > 0 &&
  byteLength(value) <= MAX_ID_BYTES &&
  /^[A-Za-z0-9_-]+$/.test(value);
const isBoundedString = (value: unknown): value is string =>
  typeof value === "string" && byteLength(value) <= MAX_TEXT_BYTES;
const isPositiveNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;
const isPromptType = (value: unknown): value is FlowPromptType =>
  value === "text" ||
  value === "secret" ||
  value === "select" ||
  value === "manual_code";

const assertOption = (value: unknown): void => {
  if (!isRecord(value)) throw new Error("invalid flow event envelope");
  const keys = Object.hasOwn(value, "description")
    ? ["id", "label", "description"]
    : ["id", "label"];
  if (
    !exactKeys(value, keys) ||
    !isValidId(value.id) ||
    !isBoundedString(value.label)
  )
    throw new Error("invalid flow event envelope");
  if (
    Object.hasOwn(value, "description") &&
    !isBoundedString(value.description)
  )
    throw new Error("invalid flow event envelope");
};

const assertStatus = (value: unknown): void => {
  if (
    !isRecord(value) ||
    !exactKeys(value, ["providerId", "configured", "source"])
  )
    throw new Error("invalid flow event envelope");
  if (
    typeof value.providerId !== "string" ||
    !isValidHarnessProviderId(value.providerId) ||
    typeof value.configured !== "boolean" ||
    (value.source !== "stored" && value.source !== "missing") ||
    value.configured !== (value.source === "stored")
  )
    throw new Error("invalid flow event envelope");
};

const assertEvent = (event: unknown): void => {
  if (!isRecord(event)) throw new Error("invalid flow event envelope");
  switch (event.type) {
    case "flow.started":
    case "flow.cancelled":
      if (!exactKeys(event, ["type"]))
        throw new Error("invalid flow event envelope");
      return;
    case "flow.info": {
      const keys = Object.hasOwn(event, "links")
        ? ["type", "message", "links"]
        : ["type", "message"];
      if (!exactKeys(event, keys) || !isBoundedString(event.message))
        throw new Error("invalid flow event envelope");
      if (Object.hasOwn(event, "links")) {
        if (!Array.isArray(event.links))
          throw new Error("invalid flow event envelope");
        for (const link of event.links) {
          if (!isRecord(link)) throw new Error("invalid flow event envelope");
          const linkKeys = Object.hasOwn(link, "label")
            ? ["url", "label"]
            : ["url"];
          if (!exactKeys(link, linkKeys) || !isBoundedString(link.url))
            throw new Error("invalid flow event envelope");
          if (Object.hasOwn(link, "label") && !isBoundedString(link.label))
            throw new Error("invalid flow event envelope");
        }
      }
      return;
    }
    case "flow.external_url": {
      const keys = Object.hasOwn(event, "instructions")
        ? ["type", "url", "instructions"]
        : ["type", "url"];
      if (!exactKeys(event, keys) || !isBoundedString(event.url))
        throw new Error("invalid flow event envelope");
      if (
        Object.hasOwn(event, "instructions") &&
        !isBoundedString(event.instructions)
      )
        throw new Error("invalid flow event envelope");
      return;
    }
    case "flow.device_code": {
      const keys = ["type", "userCode", "verificationUri"];
      const expected = [
        ...keys,
        ...(Object.hasOwn(event, "intervalSeconds") ? ["intervalSeconds"] : []),
        ...(Object.hasOwn(event, "expiresInSeconds")
          ? ["expiresInSeconds"]
          : []),
      ];
      if (
        !exactKeys(event, expected) ||
        !isBoundedString(event.userCode) ||
        !isBoundedString(event.verificationUri)
      )
        throw new Error("invalid flow event envelope");
      if (
        Object.hasOwn(event, "intervalSeconds") &&
        !isPositiveNumber(event.intervalSeconds)
      )
        throw new Error("invalid flow event envelope");
      if (
        Object.hasOwn(event, "expiresInSeconds") &&
        !isPositiveNumber(event.expiresInSeconds)
      )
        throw new Error("invalid flow event envelope");
      return;
    }
    case "flow.progress":
      if (
        !exactKeys(event, ["type", "message"]) ||
        !isBoundedString(event.message)
      )
        throw new Error("invalid flow event envelope");
      return;
    case "flow.prompt": {
      const expected = ["type", "promptId", "promptType", "message"];
      const keys = [
        ...expected,
        ...(Object.hasOwn(event, "placeholder") ? ["placeholder"] : []),
        ...(Object.hasOwn(event, "options") ? ["options"] : []),
      ];
      if (
        !exactKeys(event, keys) ||
        !isValidId(event.promptId) ||
        !isPromptType(event.promptType) ||
        !isBoundedString(event.message)
      )
        throw new Error("invalid flow event envelope");
      if (
        Object.hasOwn(event, "placeholder") &&
        !isBoundedString(event.placeholder)
      )
        throw new Error("invalid flow event envelope");
      if (Object.hasOwn(event, "options")) {
        if (!Array.isArray(event.options) || event.options.length === 0)
          throw new Error("invalid flow event envelope");
        for (const option of event.options) assertOption(option);
      }
      return;
    }
    case "flow.completed": {
      const keys = Object.hasOwn(event, "status")
        ? ["type", "status"]
        : ["type"];
      if (!exactKeys(event, keys))
        throw new Error("invalid flow event envelope");
      if (Object.hasOwn(event, "status")) assertStatus(event.status);
      return;
    }
    case "flow.failed":
      if (
        !exactKeys(event, ["type", "reason"]) ||
        !isBoundedString(event.reason)
      )
        throw new Error("invalid flow event envelope");
      return;
    default:
      throw new Error("invalid flow event envelope");
  }
};

export function parseFlowEventEnvelope(value: unknown): FlowEventEnvelope {
  if (!isRecord(value) || !exactKeys(value, ["flowId", "sequence", "event"]))
    throw new Error("invalid flow event envelope");
  if (
    !isValidId(value.flowId) ||
    !isPositiveNumber(value.sequence) ||
    !Number.isInteger(value.sequence)
  )
    throw new Error("invalid flow event envelope");
  assertEvent(value.event);
  return value as unknown as FlowEventEnvelope;
}

export function parseFlowPromptResponseRequest(
  value: unknown,
): FlowPromptResponseRequest {
  if (!isRecord(value) || !exactKeys(value, ["response"]))
    throw new Error("invalid flow response");
  if (!isBoundedString(value.response))
    throw new Error("invalid flow response");
  return value as unknown as FlowPromptResponseRequest;
}
