import { createHash, randomUUID } from "node:crypto";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import {
  deriveGlobalChatSessionInitialTitle,
  type ArchiveGlobalChatSessionRequest,
  type ArchiveGlobalChatSessionResult,
  type CancelGlobalChatSessionFollowUpResult,
  type CreateGlobalChatSessionWithFirstPromptRequest,
  type CreateGlobalChatSessionWithFirstPromptResult,
  type EnqueueGlobalChatSessionFollowUpRequest,
  type EnqueueGlobalChatSessionFollowUpResult,
  type GetGlobalChatSessionRuntimeResult,
  type GlobalChatSessionEvent,
  type GlobalChatSessionEventEnvelope,
  type GlobalChatSessionFollowUp,
  type GlobalChatSessionMessage,
  type GlobalChatSessionMessagePart,
  type GlobalChatSessionRuntimeConfiguration,
  type GlobalChatSessionSummary,
  type GlobalChatSessionTurn,
  type InterruptGlobalChatSessionTurnResult,
  type ListGlobalChatSessionFollowUpsResult,
  type ListGlobalChatSessionMessagesResult,
  type ListGlobalChatSessionsResult,
  type SubmitGlobalChatSessionPromptRequest,
  type SubmitGlobalChatSessionPromptResult,
  type UnarchiveGlobalChatSessionRequest,
  type UnarchiveGlobalChatSessionResult,
  type UpdateGlobalChatSessionRuntimeRequest,
  type UpdateGlobalChatSessionRuntimeResult,
} from "@spacezero/host-contracts";
import {
  GlobalChatSessionServiceError,
  type GlobalChatSessionTurnFailureReason,
  type GlobalChatSessionTurnInterruptReason,
} from "./global-chat-session.model.js";
import { getAgentRuntimeDefaults } from "../agent-runtime/agent-runtime-defaults.repository.js";

interface SessionRow {
  readonly session_id: string;
  readonly title: string;
  readonly archived_at: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly last_sequence: number;
}

interface MessageRow {
  readonly session_id: string;
  readonly message_id: string;
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly content_parts_json: string | null;
  readonly sequence: number;
  readonly command_id?: string | null;
  readonly turn_id: string | null;
  readonly created_at: string;
}

interface FollowUpRow {
  readonly session_id: string;
  readonly follow_up_id: string;
  readonly command_id: string;
  readonly prompt: string;
  readonly state:
    "queued" | "dispatched" | "consumed" | "cancelled" | "recovery_required";
  readonly position: number;
  readonly dispatched_turn_id: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface ReceiptRow {
  readonly command_id: string;
  readonly request_fingerprint: string;
  readonly session_id: string;
  readonly status: "pending" | "succeeded" | "failed" | "recovery_required";
  readonly terminal_error_code: string | null;
  readonly committed_sequence: number;
}

interface RuntimeConfigurationRow {
  readonly session_id: string;
  readonly provider_id: string;
  readonly model_id: string;
  readonly default_thinking_level:
    "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  readonly revision: number;
  readonly created_at: string;
  readonly updated_at: string;
}

interface TurnRow {
  readonly session_id: string;
  readonly turn_id: string;
  readonly command_id: string;
  readonly user_message_id: string;
  readonly assistant_message_id: string;
  readonly assistant_message_ids_json: string | null;
  readonly provider_id: string;
  readonly model_id: string;
  readonly thinking_level: RuntimeConfigurationRow["default_thinking_level"];
  readonly state:
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "interrupted"
    | "recovery_required";
  readonly draft_text: string;
  readonly draft_parts_json: string | null;
  readonly draft_messages_json: string | null;
  readonly failure_reason: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

interface PiContextRow {
  readonly conversation_id: string;
}

interface EventRow {
  readonly session_id: string;
  readonly sequence: number;
  readonly event_type: string;
  readonly event_payload_json: string;
  readonly created_at: string;
}

export interface GlobalPromptAdmission<
  Result extends { readonly turn: GlobalChatSessionTurn },
> {
  readonly kind: "admitted";
  readonly turnId: string;
  readonly userSequence: number;
  readonly conversationId: string;
  readonly result: Result;
}

type PromptReplay<Result> = {
  readonly kind: "replayed";
  readonly result: Result;
};

const createFingerprint = (
  input: CreateGlobalChatSessionWithFirstPromptRequest,
): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        kind: "global_chat_session_create_with_first_prompt",
        firstPrompt: input.firstPrompt.trim(),
      }),
    )
    .digest("hex");

const promptFingerprint = (
  sessionId: string,
  input: SubmitGlobalChatSessionPromptRequest,
): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        kind: "global_chat_session_prompt",
        sessionId,
        prompt: input.prompt.trim(),
      }),
    )
    .digest("hex");

const followUpFingerprint = (
  sessionId: string,
  input: EnqueueGlobalChatSessionFollowUpRequest,
): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        kind: "global_chat_session_follow_up",
        sessionId,
        prompt: input.prompt.trim(),
      }),
    )
    .digest("hex");

const runtimeFingerprint = (
  sessionId: string,
  input: UpdateGlobalChatSessionRuntimeRequest,
): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        kind: "global_chat_session_runtime",
        sessionId,
        providerId: input.providerId,
        modelId: input.modelId,
        defaultThinkingLevel: input.defaultThinkingLevel,
        expectedRevision: input.expectedRevision,
      }),
    )
    .digest("hex");

const archiveStateFingerprint = (input: {
  readonly sessionId: string;
  readonly archived: boolean;
}): string =>
  createHash("sha256")
    .update(
      JSON.stringify({
        kind: input.archived
          ? "global_chat_session_archive"
          : "global_chat_session_unarchive",
        sessionId: input.sessionId,
      }),
    )
    .digest("hex");

const failureDetails = (
  reason: GlobalChatSessionTurnFailureReason,
):
  | {
      readonly failureCategory:
        | "configuration"
        | "authentication"
        | "provider"
        | "tool"
        | "interrupted"
        | "system";
      readonly retryable: boolean;
      readonly retryAfterMs?: number;
    }
  | undefined => {
  switch (reason) {
    case "agent_configuration_invalid":
      return { failureCategory: "configuration", retryable: false };
    case "agent_authentication_required":
      return { failureCategory: "authentication", retryable: false };
    case "agent_unavailable":
      return {
        failureCategory: "provider",
        retryable: true,
        retryAfterMs: 30_000,
      };
    case "agent_turn_failed":
      return { failureCategory: "provider", retryable: true };
  }
};

const toSummary = (row: SessionRow): GlobalChatSessionSummary => ({
  id: row.session_id,
  title: row.title,
  archived: row.archived_at !== null,
  ...(row.archived_at === null ? {} : { archivedAt: row.archived_at }),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastSequence: row.last_sequence,
});

interface StoredDraftMessage {
  readonly id: string;
  readonly text: string;
  readonly parts?: readonly StoredConversationPart[];
}

type StoredConversationPart = GlobalChatSessionMessagePart extends infer Part
  ? Part extends unknown
    ? Omit<Part, "id" | "turnId">
    : never
  : never;

const partId = (messageId: string, part: StoredConversationPart): string =>
  part.type === "tool-call"
    ? `${messageId}:tool-call:${part.toolCallId}`
    : `${messageId}:${part.type}:${part.order}`;

const isStoredTextPart = (
  part: StoredConversationPart,
): part is Extract<
  StoredConversationPart,
  { readonly type: "text" | "reasoning" }
> =>
  (part.type === "text" || part.type === "reasoning") &&
  Number.isInteger(part.order) &&
  part.order >= 1 &&
  typeof part.text === "string" &&
  (part.type === "text" || part.text.length > 0);

const isStoredToolPart = (
  part: StoredConversationPart,
): part is Extract<StoredConversationPart, { readonly type: "tool-call" }> =>
  part.type === "tool-call" &&
  Number.isInteger(part.order) &&
  part.order >= 1 &&
  typeof part.toolCallId === "string" &&
  part.toolCallId.length > 0 &&
  typeof part.toolName === "string" &&
  part.toolName.length > 0 &&
  ["running", "succeeded", "failed"].includes(part.status);

const hydrateParts = (input: {
  readonly messageId: string;
  readonly turnId: string | null;
  readonly text: string;
  readonly partsJson: string | null;
}): readonly GlobalChatSessionMessagePart[] => {
  const fallback: readonly GlobalChatSessionMessagePart[] = [
    {
      id: `${input.messageId}:text:1`,
      type: "text",
      order: 1,
      text: input.text,
      ...(input.turnId === null ? {} : { turnId: input.turnId }),
    },
  ];
  if (input.partsJson === null) return fallback;
  const parsed = JSON.parse(
    input.partsJson,
  ) as readonly StoredConversationPart[];
  const parts = parsed.flatMap((part): GlobalChatSessionMessagePart[] => {
    if (!isStoredTextPart(part) && !isStoredToolPart(part)) return [];
    return [
      {
        ...part,
        id: partId(input.messageId, part),
        ...(input.turnId === null ? {} : { turnId: input.turnId }),
      } as GlobalChatSessionMessagePart,
    ];
  });
  return parts.sort((l, r) => l.order - r.order);
};

const storedParts = (
  parts: readonly StoredConversationPart[],
): readonly StoredConversationPart[] =>
  parts.map((part) => {
    if (part.type === "tool-call")
      return {
        type: part.type,
        order: part.order,
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        status: part.status,
        ...(part.arguments === undefined ? {} : { arguments: part.arguments }),
        ...(part.progress === undefined ? {} : { progress: part.progress }),
        ...(part.result === undefined ? {} : { result: part.result }),
        ...(part.safety === undefined ? {} : { safety: part.safety }),
        ...(part.approvalStatus === undefined
          ? {}
          : { approvalStatus: part.approvalStatus }),
        ...(part.approvalReason === undefined
          ? {}
          : { approvalReason: part.approvalReason }),
      };
    return {
      type: part.type,
      order: part.order,
      text: part.text,
    };
  });

const storedPartsJson = (
  parts: readonly StoredConversationPart[] | undefined,
): string | null =>
  parts === undefined ? null : JSON.stringify(storedParts(parts));

const storedMessagePartsJson = (
  parts: readonly StoredConversationPart[] | undefined,
): string => JSON.stringify(storedParts(parts ?? []));

const storedDraftMessagesJson = (
  messages: readonly StoredDraftMessage[],
): string =>
  JSON.stringify(
    messages.map((message) => ({
      id: message.id,
      text: message.text,
      parts: storedParts(message.parts ?? []),
    })),
  );

const toMessage = (row: MessageRow): GlobalChatSessionMessage => ({
  id: row.message_id,
  role: row.role,
  text: row.text,
  sequence: row.sequence,
  createdAt: row.created_at,
  ...(row.command_id === undefined || row.command_id === null
    ? {}
    : { commandId: row.command_id }),
  ...(row.turn_id === null ? {} : { turnId: row.turn_id }),
  parts: hydrateParts({
    messageId: row.message_id,
    turnId: row.turn_id,
    text: row.text,
    partsJson: row.content_parts_json,
  }),
});

const listMessagePage = (
  sql: SqlClient,
  sessionId: string,
  options?: { readonly beforeSequence?: number; readonly limit?: number },
) =>
  Effect.gen(function* () {
    const limit = options?.limit;
    const beforeSequence = options?.beforeSequence;
    if (limit === undefined && beforeSequence === undefined) {
      const rows =
        yield* sql<MessageRow>`SELECT m.*, t.command_id AS command_id FROM chat_session_messages m LEFT JOIN chat_session_turns t ON t.session_id = m.session_id AND (t.turn_id = m.turn_id) WHERE m.session_id = ${sessionId} ORDER BY m.sequence ASC`;
      return { rows, hasMoreOlder: false };
    }
    if (limit === undefined) {
      const rows =
        yield* sql<MessageRow>`SELECT m.*, t.command_id AS command_id FROM chat_session_messages m LEFT JOIN chat_session_turns t ON t.session_id = m.session_id AND (t.turn_id = m.turn_id) WHERE m.session_id = ${sessionId} AND m.sequence < ${beforeSequence} ORDER BY m.sequence ASC`;
      return { rows, hasMoreOlder: false };
    }
    const requested = limit + 1;
    const rows =
      beforeSequence === undefined
        ? yield* sql<MessageRow>`SELECT m.*, t.command_id AS command_id FROM chat_session_messages m LEFT JOIN chat_session_turns t ON t.session_id = m.session_id AND (t.turn_id = m.turn_id) WHERE m.session_id = ${sessionId} ORDER BY m.sequence DESC LIMIT ${requested}`
        : yield* sql<MessageRow>`SELECT m.*, t.command_id AS command_id FROM chat_session_messages m LEFT JOIN chat_session_turns t ON t.session_id = m.session_id AND (t.turn_id = m.turn_id) WHERE m.session_id = ${sessionId} AND m.sequence < ${beforeSequence} ORDER BY m.sequence DESC LIMIT ${requested}`;
    return {
      rows: (rows.length > limit ? rows.slice(0, limit) : rows).toReversed(),
      hasMoreOlder: rows.length > limit,
    };
  });

const messagePageInfo = (
  page: {
    readonly rows: readonly MessageRow[];
    readonly hasMoreOlder: boolean;
  },
  options?: { readonly beforeSequence?: number; readonly limit?: number },
): NonNullable<ListGlobalChatSessionMessagesResult["pageInfo"]> | undefined => {
  if (options?.limit === undefined) return undefined;
  const oldestSequence = page.rows[0]?.sequence;
  const newestSequence = page.rows.at(-1)?.sequence;
  return {
    pageSize: page.rows.length,
    hasMoreOlder: page.hasMoreOlder,
    ...(oldestSequence === undefined ? {} : { oldestSequence }),
    ...(newestSequence === undefined ? {} : { newestSequence }),
  };
};

/**
 * Pre-release wipe policy (ADR 0044): legacy single-message turn rows are
 * wiped, never backfilled, so a missing or malformed assistant message id
 * list is durable-data corruption and must fail closed.
 */
const assistantMessageIdsFromTurn = (row: TurnRow): readonly string[] => {
  if (row.assistant_message_ids_json === null)
    throw new GlobalChatSessionServiceError("global_chat_session_unavailable");
  const parsed = JSON.parse(row.assistant_message_ids_json) as unknown;
  if (
    !Array.isArray(parsed) ||
    parsed.some((value) => typeof value !== "string")
  )
    throw new GlobalChatSessionServiceError("global_chat_session_unavailable");
  return parsed;
};

const draftMessagesFromTurn = (
  row: TurnRow,
):
  | readonly {
      readonly id: string;
      readonly text: string;
      readonly parts: readonly GlobalChatSessionMessagePart[];
    }[]
  | undefined => {
  if (row.draft_messages_json === null) return undefined;
  const parsed = JSON.parse(row.draft_messages_json) as unknown;
  if (!Array.isArray(parsed))
    throw new GlobalChatSessionServiceError("global_chat_session_unavailable");
  return parsed.map(
    (
      message,
    ): {
      readonly id: string;
      readonly text: string;
      readonly parts: readonly GlobalChatSessionMessagePart[];
    } => {
      if (
        typeof message !== "object" ||
        message === null ||
        !("id" in message) ||
        typeof message.id !== "string" ||
        message.id.length === 0 ||
        !("text" in message) ||
        typeof message.text !== "string" ||
        !("parts" in message) ||
        !Array.isArray(message.parts)
      )
        throw new GlobalChatSessionServiceError(
          "global_chat_session_unavailable",
        );
      return {
        id: message.id,
        text: message.text,
        parts: hydrateParts({
          messageId: message.id,
          turnId: row.turn_id,
          text: message.text,
          partsJson: JSON.stringify(message.parts),
        }),
      };
    },
  );
};

const toTurn = (row: TurnRow): GlobalChatSessionTurn => {
  const details = row.failure_reason
    ? failureDetails(row.failure_reason as GlobalChatSessionTurnFailureReason)
    : undefined;
  const draftMessages = draftMessagesFromTurn(row);
  // While a turn is active, draftMessages is always present: an empty array
  // until the first checkpoint produces drafts.
  const turnActive =
    row.state === "queued" ||
    row.state === "running" ||
    row.state === "recovery_required";
  return {
    id: row.turn_id,
    commandId: row.command_id,
    state: row.state,
    userMessageId: row.user_message_id,
    assistantMessageId: row.assistant_message_id,
    assistantMessageIds: assistantMessageIdsFromTurn(row),
    providerId: row.provider_id,
    modelId: row.model_id,
    thinkingLevel: row.thinking_level,
    draftText: row.draft_text,
    ...(row.draft_parts_json === null
      ? {}
      : {
          draftParts: hydrateParts({
            messageId: row.assistant_message_id,
            turnId: row.turn_id,
            text: row.draft_text,
            partsJson: row.draft_parts_json,
          }),
        }),
    ...(draftMessages === undefined
      ? turnActive
        ? { draftMessages: [] }
        : {}
      : { draftMessages }),
    ...(row.failure_reason === null
      ? {}
      : { failureReason: row.failure_reason }),
    ...(details === undefined
      ? {}
      : {
          failureCategory: details.failureCategory,
          retryable: details.retryable,
          ...(details.retryAfterMs === undefined
            ? {}
            : { retryAfterMs: details.retryAfterMs }),
        }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const toFollowUp = (row: FollowUpRow): GlobalChatSessionFollowUp => ({
  id: row.follow_up_id,
  commandId: row.command_id,
  sessionId: row.session_id,
  prompt: row.prompt,
  state: row.state,
  position: row.position,
  ...(row.dispatched_turn_id === null
    ? {}
    : { dispatchedTurnId: row.dispatched_turn_id }),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toRuntimeConfiguration = (
  row: RuntimeConfigurationRow,
): GlobalChatSessionRuntimeConfiguration => ({
  providerId: row.provider_id,
  modelId: row.model_id,
  defaultThinkingLevel: row.default_thinking_level,
  revision: row.revision,
});

const toEventEnvelope = (row: EventRow): GlobalChatSessionEventEnvelope => {
  const event = JSON.parse(row.event_payload_json) as GlobalChatSessionEvent;
  return { sequence: row.sequence, eventType: row.event_type, event };
};

const runSql = async <A>(
  databasePath: string,
  effect: Effect.Effect<A, unknown, SqlClient>,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient;
      yield* sql`PRAGMA foreign_keys = ON`;
      return yield* effect;
    }).pipe(Effect.provide(SqliteClient.layer({ filename: databasePath }))),
  );

const getSession = (sql: SqlClient, sessionId: string) =>
  sql<SessionRow>`SELECT * FROM chat_sessions WHERE session_id = ${sessionId} AND kind = 'global'`;

const getMessageById = (sql: SqlClient, sessionId: string, messageId: string) =>
  sql<MessageRow>`SELECT m.*, t.command_id AS command_id FROM chat_session_messages m LEFT JOIN chat_session_turns t ON t.session_id = m.session_id AND (t.turn_id = m.turn_id) WHERE m.session_id = ${sessionId} AND m.message_id = ${messageId}`;

const getFirstMessage = (sql: SqlClient, sessionId: string) =>
  sql<MessageRow>`SELECT m.*, t.command_id AS command_id FROM chat_session_messages m LEFT JOIN chat_session_turns t ON t.session_id = m.session_id AND t.user_message_id = m.message_id WHERE m.session_id = ${sessionId} AND m.role = 'user' ORDER BY m.sequence ASC LIMIT 1`;

const getPiConversationId = (sql: SqlClient, sessionId: string) =>
  Effect.gen(function* () {
    const rows =
      yield* sql<PiContextRow>`SELECT conversation_id FROM chat_session_pi_contexts WHERE session_id = ${sessionId}`;
    if (!rows[0])
      throw new GlobalChatSessionServiceError(
        "global_chat_session_unavailable",
      );
    return rows[0].conversation_id;
  });

const appendEvent = (input: {
  readonly sql: SqlClient;
  readonly sessionId: string;
  readonly sequence: number;
  readonly payload: GlobalChatSessionEvent;
  readonly createdAt: string;
}) =>
  input.sql`INSERT INTO chat_session_events (session_id, sequence, event_id, event_type, event_version, event_payload_json, created_at) VALUES (${input.sessionId}, ${input.sequence}, ${randomUUID()}, ${input.payload.type}, 1, ${JSON.stringify(input.payload)}, ${input.createdAt})`;

const replayPromptResult = <Result extends SubmitGlobalChatSessionPromptResult>(
  sql: SqlClient,
  sessionId: string,
  receipt: ReceiptRow,
) =>
  Effect.gen(function* () {
    if (receipt.status === "failed")
      throw new GlobalChatSessionServiceError(
        (receipt.terminal_error_code as never) ?? "agent_turn_failed",
      );
    if (receipt.status === "recovery_required")
      throw new GlobalChatSessionServiceError(
        "global_chat_session_recovery_required",
      );
    const sessions = yield* getSession(sql, sessionId);
    const turnRows =
      yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE command_id = ${receipt.command_id}`;
    if (!sessions[0] || !turnRows[0])
      throw new GlobalChatSessionServiceError(
        "global_chat_session_unavailable",
      );
    const messages = yield* getMessageById(
      sql,
      sessionId,
      turnRows[0].user_message_id,
    );
    if (!messages[0])
      throw new GlobalChatSessionServiceError(
        "global_chat_session_unavailable",
      );
    return {
      session: toSummary(sessions[0]),
      turn: toTurn(turnRows[0]),
      userMessage: toMessage(messages[0]),
    } as Result;
  });

const replayCreateResult = (sql: SqlClient, sessionId: string) =>
  Effect.gen(function* () {
    const result =
      yield* replayPromptResult<CreateGlobalChatSessionWithFirstPromptResult>(
        sql,
        sessionId,
        (yield* sql<ReceiptRow>`SELECT * FROM chat_session_command_receipts WHERE session_id = ${sessionId} ORDER BY created_at ASC LIMIT 1`)[0]!,
      );
    const firstMessage = yield* getFirstMessage(sql, sessionId);
    if (!firstMessage[0])
      throw new GlobalChatSessionServiceError(
        "global_chat_session_unavailable",
      );
    return { ...result, firstMessage: toMessage(firstMessage[0]) };
  });

const ensureOpen = (row: SessionRow): void => {
  if (row.archived_at !== null)
    throw new GlobalChatSessionServiceError("global_chat_session_archived");
};

const admitPromptInTransaction = <
  Result extends SubmitGlobalChatSessionPromptResult,
>(input: {
  readonly sql: SqlClient;
  readonly sessionId: string;
  readonly commandId: string;
  readonly prompt: string;
  readonly fingerprint: string;
}) =>
  Effect.gen(function* () {
    const receipt =
      yield* input.sql<ReceiptRow>`SELECT * FROM chat_session_command_receipts WHERE command_id = ${input.commandId}`;
    if (receipt[0]) {
      if (receipt[0].request_fingerprint !== input.fingerprint)
        throw new GlobalChatSessionServiceError("command_id_conflict");
      const result = yield* replayPromptResult<Result>(
        input.sql,
        receipt[0].session_id,
        receipt[0],
      );
      return { kind: "replayed" as const, result };
    }

    const rows = yield* getSession(input.sql, input.sessionId);
    if (!rows[0])
      throw new GlobalChatSessionServiceError("global_chat_session_not_found");
    ensureOpen(rows[0]);
    const runtimeRows =
      yield* input.sql<RuntimeConfigurationRow>`SELECT * FROM chat_session_runtime_configurations WHERE session_id = ${input.sessionId}`;
    if (!runtimeRows[0])
      throw new GlobalChatSessionServiceError(
        "global_chat_session_unavailable",
      );
    const activeTurns =
      yield* input.sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND state IN ('queued', 'running', 'recovery_required') LIMIT 1`;
    if (activeTurns[0])
      throw new GlobalChatSessionServiceError(
        "global_chat_session_turn_in_progress",
      );
    const conversationId = yield* getPiConversationId(
      input.sql,
      input.sessionId,
    );
    const runtime = toRuntimeConfiguration(runtimeRows[0]);
    const now = new Date().toISOString();
    const turnId = randomUUID();
    const userMessageId = randomUUID();
    const assistantMessageId = randomUUID();
    const baseSequence = rows[0].last_sequence;

    yield* appendEvent({
      sql: input.sql,
      sessionId: input.sessionId,
      sequence: baseSequence + 1,
      payload: {
        type: "GlobalChatUserMessageSubmittedV1",
        version: 1,
        sessionId: input.sessionId,
        messageId: userMessageId,
        commandId: input.commandId,
        prompt: input.prompt,
        timestamp: now,
      },
      createdAt: now,
    });
    yield* appendEvent({
      sql: input.sql,
      sessionId: input.sessionId,
      sequence: baseSequence + 2,
      payload: {
        type: "GlobalChatAgentTurnStartedV1",
        version: 1,
        sessionId: input.sessionId,
        turnId,
        messageId: assistantMessageId,
        providerId: runtime.providerId,
        modelId: runtime.modelId,
        thinkingLevel: runtime.defaultThinkingLevel,
        timestamp: now,
      },
      createdAt: now,
    });
    yield* input.sql`INSERT INTO chat_session_messages (session_id, message_id, role, text, sequence, turn_id, created_at) VALUES (${input.sessionId}, ${userMessageId}, 'user', ${input.prompt}, ${baseSequence + 1}, ${turnId}, ${now})`;
    yield* input.sql`INSERT INTO chat_session_turns (session_id, turn_id, command_id, user_message_id, assistant_message_id, assistant_message_ids_json, provider_id, model_id, thinking_level, state, draft_text, created_at, updated_at) VALUES (${input.sessionId}, ${turnId}, ${input.commandId}, ${userMessageId}, ${assistantMessageId}, ${JSON.stringify([assistantMessageId])}, ${runtime.providerId}, ${runtime.modelId}, ${runtime.defaultThinkingLevel}, 'running', '', ${now}, ${now})`;
    yield* input.sql`UPDATE chat_session_pi_contexts SET last_turn_id = ${turnId}, updated_at = ${now} WHERE session_id = ${input.sessionId}`;
    yield* input.sql`INSERT INTO chat_session_command_receipts (command_id, request_fingerprint, session_id, status, committed_sequence, created_at, updated_at) VALUES (${input.commandId}, ${input.fingerprint}, ${input.sessionId}, 'pending', ${baseSequence + 2}, ${now}, ${now})`;
    yield* input.sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${baseSequence + 2} WHERE session_id = ${input.sessionId}`;

    const updated = yield* getSession(input.sql, input.sessionId);
    const userRows = yield* getMessageById(
      input.sql,
      input.sessionId,
      userMessageId,
    );
    const turnRows =
      yield* input.sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${turnId}`;
    if (!updated[0] || !userRows[0] || !turnRows[0])
      throw new GlobalChatSessionServiceError(
        "global_chat_session_unavailable",
      );
    return {
      kind: "admitted" as const,
      turnId,
      userSequence: baseSequence + 1,
      conversationId,
      result: {
        session: toSummary(updated[0]),
        turn: toTurn(turnRows[0]),
        userMessage: toMessage(userRows[0]),
      } as Result,
    };
  });

/**
 * Applies archive or unarchive state as a durable Session event plus
 * projection update. Follows the command receipt pattern: the same command ID
 * with the same input replays the current session summary, and a different
 * command ID against an unchanged archive state is an idempotent no-op that
 * still records a receipt.
 */
const applyArchivedStateInTransaction = (input: {
  readonly sessionId: string;
  readonly commandId: string;
  readonly archived: boolean;
}) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient;
    const fp = archiveStateFingerprint({
      sessionId: input.sessionId,
      archived: input.archived,
    });
    return yield* sql.withTransaction(
      Effect.gen(function* () {
        const receipt =
          yield* sql<ReceiptRow>`SELECT * FROM chat_session_command_receipts WHERE command_id = ${input.commandId}`;
        if (receipt[0]) {
          if (receipt[0].request_fingerprint !== fp)
            throw new GlobalChatSessionServiceError("command_id_conflict");
          if (
            receipt[0].status === "failed" ||
            receipt[0].status === "recovery_required"
          )
            throw new GlobalChatSessionServiceError(
              (receipt[0].terminal_error_code as never) ??
                "global_chat_session_unavailable",
            );
          const rows = yield* getSession(sql, receipt[0].session_id);
          if (!rows[0])
            throw new GlobalChatSessionServiceError(
              "global_chat_session_unavailable",
            );
          return { session: toSummary(rows[0]) };
        }

        const rows = yield* getSession(sql, input.sessionId);
        if (!rows[0])
          throw new GlobalChatSessionServiceError(
            "global_chat_session_not_found",
          );
        if (input.archived) {
          const activeTurns =
            yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND state IN ('queued', 'running', 'recovery_required') LIMIT 1`;
          if (activeTurns[0])
            throw new GlobalChatSessionServiceError(
              "global_chat_session_turn_in_progress",
            );
        }
        const alreadyArchived = rows[0].archived_at !== null;
        const now = new Date().toISOString();
        if (alreadyArchived === input.archived) {
          yield* sql`INSERT INTO chat_session_command_receipts (command_id, request_fingerprint, session_id, status, committed_sequence, created_at, updated_at) VALUES (${input.commandId}, ${fp}, ${input.sessionId}, 'succeeded', ${rows[0].last_sequence}, ${now}, ${now})`;
          return { session: toSummary(rows[0]) };
        }
        const sequence = rows[0].last_sequence + 1;
        yield* appendEvent({
          sql,
          sessionId: input.sessionId,
          sequence,
          payload: {
            type: input.archived
              ? "GlobalChatSessionArchivedV1"
              : "GlobalChatSessionUnarchivedV1",
            version: 1,
            sessionId: input.sessionId,
            commandId: input.commandId,
            timestamp: now,
          },
          createdAt: now,
        });
        yield* sql`UPDATE chat_sessions SET archived_at = ${input.archived ? now : null}, updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${input.sessionId}`;
        yield* sql`INSERT INTO chat_session_command_receipts (command_id, request_fingerprint, session_id, status, committed_sequence, created_at, updated_at) VALUES (${input.commandId}, ${fp}, ${input.sessionId}, 'succeeded', ${sequence}, ${now}, ${now})`;
        const updated = yield* getSession(sql, input.sessionId);
        if (!updated[0])
          throw new GlobalChatSessionServiceError(
            "global_chat_session_unavailable",
          );
        return { session: toSummary(updated[0]) };
      }),
    );
  });

export const createGlobalChatSessionRepository = (options: {
  readonly databasePath: string;
}) => ({
  list: async (): Promise<ListGlobalChatSessionsResult> =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const rows =
          yield* sql<SessionRow>`SELECT * FROM chat_sessions WHERE kind = 'global' ORDER BY updated_at DESC, session_id DESC`;
        return { sessions: rows.map(toSummary) };
      }),
    ),

  createWithFirstPrompt: async (
    input: CreateGlobalChatSessionWithFirstPromptRequest,
  ): Promise<
    | GlobalPromptAdmission<CreateGlobalChatSessionWithFirstPromptResult>
    | PromptReplay<CreateGlobalChatSessionWithFirstPromptResult>
  > =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const fp = createFingerprint(input);
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const receipt =
              yield* sql<ReceiptRow>`SELECT * FROM chat_session_command_receipts WHERE command_id = ${input.commandId}`;
            if (receipt[0]) {
              if (receipt[0].request_fingerprint !== fp)
                throw new GlobalChatSessionServiceError("command_id_conflict");
              return {
                kind: "replayed" as const,
                result: yield* replayCreateResult(sql, receipt[0].session_id),
              };
            }

            const defaults = yield* getAgentRuntimeDefaults(sql);
            if (
              !defaults.defaultModel ||
              defaults.defaultThinkingLevel === null
            )
              throw new GlobalChatSessionServiceError(
                "agent_default_model_missing",
              );
            const seededRuntime = {
              providerId: defaults.defaultModel.providerId,
              modelId: defaults.defaultModel.modelId,
              defaultThinkingLevel: defaults.defaultThinkingLevel,
            };

            const sessionId = randomUUID();
            const now = new Date().toISOString();
            const firstPrompt = input.firstPrompt.trim();
            const title = deriveGlobalChatSessionInitialTitle(firstPrompt);
            yield* sql`INSERT INTO chat_sessions (session_id, kind, title, archived_at, created_at, updated_at, last_sequence) VALUES (${sessionId}, 'global', ${title}, NULL, ${now}, ${now}, 2)`;
            yield* appendEvent({
              sql,
              sessionId,
              sequence: 1,
              payload: {
                type: "GlobalChatSessionCreatedV1",
                version: 1,
                sessionId,
                title,
                timestamp: now,
              },
              createdAt: now,
            });
            yield* appendEvent({
              sql,
              sessionId,
              sequence: 2,
              payload: {
                type: "GlobalChatSessionRuntimeConfiguredV1",
                version: 1,
                sessionId,
                commandId: sessionId,
                providerId: seededRuntime.providerId,
                modelId: seededRuntime.modelId,
                defaultThinkingLevel: seededRuntime.defaultThinkingLevel,
                revision: 1,
                timestamp: now,
              },
              createdAt: now,
            });
            yield* sql`INSERT INTO chat_session_runtime_configurations (session_id, provider_id, model_id, default_thinking_level, revision, created_at, updated_at) VALUES (${sessionId}, ${seededRuntime.providerId}, ${seededRuntime.modelId}, ${seededRuntime.defaultThinkingLevel}, 1, ${now}, ${now})`;
            yield* sql`INSERT INTO chat_session_pi_contexts (session_id, conversation_id, created_at, updated_at) VALUES (${sessionId}, ${sessionId}, ${now}, ${now})`;
            const admitted =
              yield* admitPromptInTransaction<CreateGlobalChatSessionWithFirstPromptResult>(
                {
                  sql,
                  sessionId,
                  commandId: input.commandId,
                  prompt: firstPrompt,
                  fingerprint: fp,
                },
              );
            if (admitted.kind === "replayed") return admitted;
            const firstMessage = yield* getFirstMessage(sql, sessionId);
            if (!firstMessage[0])
              throw new GlobalChatSessionServiceError(
                "global_chat_session_unavailable",
              );
            return {
              ...admitted,
              result: {
                ...admitted.result,
                firstMessage: toMessage(firstMessage[0]),
              },
            };
          }),
        );
      }),
    ),

  submitPrompt: async (input: {
    readonly sessionId: string;
    readonly commandId: string;
    readonly prompt: string;
  }): Promise<
    | GlobalPromptAdmission<SubmitGlobalChatSessionPromptResult>
    | PromptReplay<SubmitGlobalChatSessionPromptResult>
  > =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const payload = { commandId: input.commandId, prompt: input.prompt };
        const fp = promptFingerprint(input.sessionId, payload);
        return yield* sql.withTransaction(
          admitPromptInTransaction<SubmitGlobalChatSessionPromptResult>({
            sql,
            sessionId: input.sessionId,
            commandId: input.commandId,
            prompt: input.prompt.trim(),
            fingerprint: fp,
          }),
        );
      }),
    ),

  listFollowUps: async (
    sessionId: string,
  ): Promise<ListGlobalChatSessionFollowUpsResult> =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const rows = yield* getSession(sql, sessionId);
        if (!rows[0])
          throw new GlobalChatSessionServiceError(
            "global_chat_session_not_found",
          );
        const followUps =
          yield* sql<FollowUpRow>`SELECT * FROM global_chat_session_follow_ups WHERE session_id = ${sessionId} ORDER BY position ASC, created_at ASC`;
        return {
          session: toSummary(rows[0]),
          followUps: followUps.map(toFollowUp),
        };
      }),
    ),

  enqueueFollowUp: async (
    sessionId: string,
    input: EnqueueGlobalChatSessionFollowUpRequest,
  ): Promise<EnqueueGlobalChatSessionFollowUpResult> =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const fp = followUpFingerprint(sessionId, input);
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const existingFollowUp =
              yield* sql<FollowUpRow>`SELECT * FROM global_chat_session_follow_ups WHERE command_id = ${input.commandId}`;
            if (existingFollowUp[0]) {
              if (
                followUpFingerprint(existingFollowUp[0].session_id, {
                  commandId: input.commandId,
                  prompt: existingFollowUp[0].prompt,
                }) !== fp
              )
                throw new GlobalChatSessionServiceError("command_id_conflict");
              const sessionRows = yield* getSession(
                sql,
                existingFollowUp[0].session_id,
              );
              if (!sessionRows[0])
                throw new GlobalChatSessionServiceError(
                  "follow_up_queue_unavailable",
                );
              return {
                session: toSummary(sessionRows[0]),
                followUp: toFollowUp(existingFollowUp[0]),
              };
            }
            const sessionRows = yield* getSession(sql, sessionId);
            if (!sessionRows[0])
              throw new GlobalChatSessionServiceError(
                "global_chat_session_not_found",
              );
            ensureOpen(sessionRows[0]);
            const positionRows = yield* sql<{
              position: number | null;
            }>`SELECT max(position) AS position FROM global_chat_session_follow_ups WHERE session_id = ${sessionId}`;
            const position = (positionRows[0]?.position ?? 0) + 1;
            const followUpId = randomUUID();
            const now = new Date().toISOString();
            const sequence = sessionRows[0].last_sequence + 1;
            yield* appendEvent({
              sql,
              sessionId,
              sequence,
              payload: {
                type: "GlobalChatSessionFollowUpQueuedV1",
                version: 1,
                sessionId,
                followUpId,
                commandId: input.commandId,
                prompt: input.prompt.trim(),
                position,
                timestamp: now,
              },
              createdAt: now,
            });
            yield* sql`INSERT INTO global_chat_session_follow_ups (session_id, follow_up_id, command_id, prompt, state, position, created_at, updated_at) VALUES (${sessionId}, ${followUpId}, ${input.commandId}, ${input.prompt.trim()}, 'queued', ${position}, ${now}, ${now})`;
            yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${sessionId}`;
            const updated = yield* getSession(sql, sessionId);
            const followUpRows =
              yield* sql<FollowUpRow>`SELECT * FROM global_chat_session_follow_ups WHERE session_id = ${sessionId} AND follow_up_id = ${followUpId}`;
            if (!updated[0] || !followUpRows[0])
              throw new GlobalChatSessionServiceError(
                "follow_up_queue_unavailable",
              );
            return {
              session: toSummary(updated[0]),
              followUp: toFollowUp(followUpRows[0]),
            };
          }),
        );
      }),
    ),

  cancelFollowUp: async (
    sessionId: string,
    followUpId: string,
  ): Promise<CancelGlobalChatSessionFollowUpResult> =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const sessionRows = yield* getSession(sql, sessionId);
            if (!sessionRows[0])
              throw new GlobalChatSessionServiceError(
                "global_chat_session_not_found",
              );
            const followUpRows =
              yield* sql<FollowUpRow>`SELECT * FROM global_chat_session_follow_ups WHERE session_id = ${sessionId} AND follow_up_id = ${followUpId}`;
            if (!followUpRows[0])
              throw new GlobalChatSessionServiceError("follow_up_not_found");
            if (followUpRows[0].state !== "queued")
              throw new GlobalChatSessionServiceError(
                "follow_up_not_cancellable",
              );
            const now = new Date().toISOString();
            const sequence = sessionRows[0].last_sequence + 1;
            yield* appendEvent({
              sql,
              sessionId,
              sequence,
              payload: {
                type: "GlobalChatSessionFollowUpCancelledV1",
                version: 1,
                sessionId,
                followUpId,
                commandId: followUpRows[0].command_id,
                timestamp: now,
              },
              createdAt: now,
            });
            yield* sql`UPDATE global_chat_session_follow_ups SET state = 'cancelled', updated_at = ${now} WHERE session_id = ${sessionId} AND follow_up_id = ${followUpId}`;
            yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${sessionId}`;
            const updated = yield* getSession(sql, sessionId);
            const updatedFollowUp =
              yield* sql<FollowUpRow>`SELECT * FROM global_chat_session_follow_ups WHERE session_id = ${sessionId} AND follow_up_id = ${followUpId}`;
            if (!updated[0] || !updatedFollowUp[0])
              throw new GlobalChatSessionServiceError(
                "follow_up_queue_unavailable",
              );
            return {
              session: toSummary(updated[0]),
              followUp: toFollowUp(updatedFollowUp[0]),
            };
          }),
        );
      }),
    ),

  dispatchNextFollowUp: async (
    sessionId: string,
  ): Promise<GlobalChatSessionFollowUp | undefined> =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const sessionRows = yield* getSession(sql, sessionId);
            if (!sessionRows[0]) return undefined;
            // Archived sessions are history-only: queued follow-ups stay
            // paused until the session is unarchived.
            if (sessionRows[0].archived_at !== null) return undefined;
            const activeTurns =
              yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${sessionId} AND state IN ('queued', 'running', 'recovery_required') LIMIT 1`;
            if (activeTurns[0]) return undefined;
            const followUpRows =
              yield* sql<FollowUpRow>`SELECT * FROM global_chat_session_follow_ups WHERE session_id = ${sessionId} AND state = 'queued' ORDER BY position ASC, created_at ASC LIMIT 1`;
            if (!followUpRows[0]) return undefined;
            const now = new Date().toISOString();
            const sequence = sessionRows[0].last_sequence + 1;
            yield* appendEvent({
              sql,
              sessionId,
              sequence,
              payload: {
                type: "GlobalChatSessionFollowUpDispatchedV1",
                version: 1,
                sessionId,
                followUpId: followUpRows[0].follow_up_id,
                commandId: followUpRows[0].command_id,
                timestamp: now,
              },
              createdAt: now,
            });
            yield* sql`UPDATE global_chat_session_follow_ups SET state = 'dispatched', updated_at = ${now} WHERE session_id = ${sessionId} AND follow_up_id = ${followUpRows[0].follow_up_id}`;
            yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${sessionId}`;
            const updatedFollowUp =
              yield* sql<FollowUpRow>`SELECT * FROM global_chat_session_follow_ups WHERE session_id = ${sessionId} AND follow_up_id = ${followUpRows[0].follow_up_id}`;
            return updatedFollowUp[0]
              ? toFollowUp(updatedFollowUp[0])
              : undefined;
          }),
        );
      }),
    ),

  markFollowUpConsumed: async (input: {
    readonly sessionId: string;
    readonly followUpId: string;
    readonly turnId: string;
  }): Promise<void> => {
    await runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const sessionRows = yield* getSession(sql, input.sessionId);
            const followUpRows =
              yield* sql<FollowUpRow>`SELECT * FROM global_chat_session_follow_ups WHERE session_id = ${input.sessionId} AND follow_up_id = ${input.followUpId}`;
            if (!sessionRows[0] || !followUpRows[0]) return;
            if (followUpRows[0].state !== "dispatched") return;
            const now = new Date().toISOString();
            const sequence = sessionRows[0].last_sequence + 1;
            yield* appendEvent({
              sql,
              sessionId: input.sessionId,
              sequence,
              payload: {
                type: "GlobalChatSessionFollowUpConsumedV1",
                version: 1,
                sessionId: input.sessionId,
                followUpId: input.followUpId,
                commandId: followUpRows[0].command_id,
                turnId: input.turnId,
                timestamp: now,
              },
              createdAt: now,
            });
            yield* sql`UPDATE global_chat_session_follow_ups SET state = 'consumed', dispatched_turn_id = ${input.turnId}, updated_at = ${now} WHERE session_id = ${input.sessionId} AND follow_up_id = ${input.followUpId}`;
            yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${input.sessionId}`;
          }),
        );
      }),
    );
  },

  markFollowUpRecoveryRequired: async (input: {
    readonly sessionId: string;
    readonly followUpId: string;
  }): Promise<void> => {
    await runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const sessionRows = yield* getSession(sql, input.sessionId);
            const followUpRows =
              yield* sql<FollowUpRow>`SELECT * FROM global_chat_session_follow_ups WHERE session_id = ${input.sessionId} AND follow_up_id = ${input.followUpId}`;
            if (!sessionRows[0] || !followUpRows[0]) return;
            if (followUpRows[0].state !== "dispatched") return;
            const now = new Date().toISOString();
            const sequence = sessionRows[0].last_sequence + 1;
            yield* appendEvent({
              sql,
              sessionId: input.sessionId,
              sequence,
              payload: {
                type: "GlobalChatSessionFollowUpRecoveryRequiredV1",
                version: 1,
                sessionId: input.sessionId,
                followUpId: input.followUpId,
                commandId: followUpRows[0].command_id,
                timestamp: now,
              },
              createdAt: now,
            });
            yield* sql`UPDATE global_chat_session_follow_ups SET state = 'recovery_required', updated_at = ${now} WHERE session_id = ${input.sessionId} AND follow_up_id = ${input.followUpId} AND state = 'dispatched'`;
            yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${input.sessionId}`;
          }),
        );
      }),
    );
  },

  markDispatchedFollowUpsRecoveryRequired: async (): Promise<void> => {
    await runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const rows =
              yield* sql<FollowUpRow>`SELECT * FROM global_chat_session_follow_ups WHERE state = 'dispatched' ORDER BY updated_at ASC`;
            for (const row of rows) {
              const sessionRows = yield* getSession(sql, row.session_id);
              if (!sessionRows[0]) continue;
              const now = new Date().toISOString();
              const sequence = sessionRows[0].last_sequence + 1;
              yield* appendEvent({
                sql,
                sessionId: row.session_id,
                sequence,
                payload: {
                  type: "GlobalChatSessionFollowUpRecoveryRequiredV1",
                  version: 1,
                  sessionId: row.session_id,
                  followUpId: row.follow_up_id,
                  commandId: row.command_id,
                  timestamp: now,
                },
                createdAt: now,
              });
              yield* sql`UPDATE global_chat_session_follow_ups SET state = 'recovery_required', updated_at = ${now} WHERE session_id = ${row.session_id} AND follow_up_id = ${row.follow_up_id}`;
              yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${row.session_id}`;
            }
          }),
        );
      }),
    );
  },

  getRuntime: async (
    sessionId: string,
  ): Promise<GetGlobalChatSessionRuntimeResult> =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const rows = yield* getSession(sql, sessionId);
        if (!rows[0])
          throw new GlobalChatSessionServiceError(
            "global_chat_session_not_found",
          );
        const runtimeRows =
          yield* sql<RuntimeConfigurationRow>`SELECT * FROM chat_session_runtime_configurations WHERE session_id = ${sessionId}`;
        if (!runtimeRows[0])
          throw new GlobalChatSessionServiceError(
            "global_chat_session_unavailable",
          );
        return {
          session: toSummary(rows[0]),
          runtime: toRuntimeConfiguration(runtimeRows[0]),
        };
      }),
    ),

  updateRuntime: async (
    sessionId: string,
    input: UpdateGlobalChatSessionRuntimeRequest,
    validateSelection?: () => Promise<void>,
  ): Promise<UpdateGlobalChatSessionRuntimeResult> =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const fp = runtimeFingerprint(sessionId, input);
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const receipt =
              yield* sql<ReceiptRow>`SELECT * FROM chat_session_command_receipts WHERE command_id = ${input.commandId}`;
            if (receipt[0]) {
              if (receipt[0].request_fingerprint !== fp)
                throw new GlobalChatSessionServiceError("command_id_conflict");
              const rows = yield* getSession(sql, sessionId);
              const runtimeEvents = yield* sql<{
                event_payload_json: string;
              }>`SELECT event_payload_json FROM chat_session_events WHERE session_id = ${sessionId} AND event_type = 'GlobalChatSessionRuntimeConfiguredV1' AND json_extract(event_payload_json, '$.commandId') = ${input.commandId} LIMIT 1`;
              if (!rows[0] || !runtimeEvents[0])
                throw new GlobalChatSessionServiceError(
                  "global_chat_session_unavailable",
                );
              const event = JSON.parse(
                runtimeEvents[0].event_payload_json,
              ) as Extract<
                GlobalChatSessionEvent,
                { readonly type: "GlobalChatSessionRuntimeConfiguredV1" }
              >;
              return {
                session: toSummary(rows[0]),
                runtime: {
                  providerId: event.providerId,
                  modelId: event.modelId,
                  defaultThinkingLevel: event.defaultThinkingLevel,
                  revision: event.revision,
                },
              };
            }
            const rows = yield* getSession(sql, sessionId);
            if (!rows[0])
              throw new GlobalChatSessionServiceError(
                "global_chat_session_not_found",
              );
            ensureOpen(rows[0]);
            const activeTurns =
              yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${sessionId} AND state IN ('queued', 'running', 'recovery_required') LIMIT 1`;
            if (activeTurns[0])
              throw new GlobalChatSessionServiceError(
                "global_chat_session_turn_in_progress",
              );
            const runtimeRows =
              yield* sql<RuntimeConfigurationRow>`SELECT * FROM chat_session_runtime_configurations WHERE session_id = ${sessionId}`;
            if (!runtimeRows[0])
              throw new GlobalChatSessionServiceError(
                "global_chat_session_unavailable",
              );
            if (runtimeRows[0].revision !== input.expectedRevision)
              throw new GlobalChatSessionServiceError(
                "global_chat_session_runtime_revision_conflict",
              );
            if (validateSelection) yield* Effect.promise(validateSelection);
            const now = new Date().toISOString();
            const nextRevision = runtimeRows[0].revision + 1;
            const sequence = rows[0].last_sequence + 1;
            yield* appendEvent({
              sql,
              sessionId,
              sequence,
              payload: {
                type: "GlobalChatSessionRuntimeConfiguredV1",
                version: 1,
                sessionId,
                commandId: input.commandId,
                providerId: input.providerId,
                modelId: input.modelId,
                defaultThinkingLevel: input.defaultThinkingLevel,
                revision: nextRevision,
                timestamp: now,
              },
              createdAt: now,
            });
            yield* sql`UPDATE chat_session_runtime_configurations SET provider_id = ${input.providerId}, model_id = ${input.modelId}, default_thinking_level = ${input.defaultThinkingLevel}, revision = ${nextRevision}, updated_at = ${now} WHERE session_id = ${sessionId}`;
            yield* sql`INSERT INTO chat_session_command_receipts (command_id, request_fingerprint, session_id, status, committed_sequence, created_at, updated_at) VALUES (${input.commandId}, ${fp}, ${sessionId}, 'succeeded', ${sequence}, ${now}, ${now})`;
            yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${sessionId}`;
            const updated = yield* getSession(sql, sessionId);
            const updatedRuntime =
              yield* sql<RuntimeConfigurationRow>`SELECT * FROM chat_session_runtime_configurations WHERE session_id = ${sessionId}`;
            if (!updated[0] || !updatedRuntime[0])
              throw new GlobalChatSessionServiceError(
                "global_chat_session_unavailable",
              );
            return {
              session: toSummary(updated[0]),
              runtime: toRuntimeConfiguration(updatedRuntime[0]),
            };
          }),
        );
      }),
    ),

  archiveSession: async (
    sessionId: string,
    input: ArchiveGlobalChatSessionRequest,
  ): Promise<ArchiveGlobalChatSessionResult> =>
    runSql(
      options.databasePath,
      applyArchivedStateInTransaction({
        sessionId,
        commandId: input.commandId,
        archived: true,
      }),
    ),

  unarchiveSession: async (
    sessionId: string,
    input: UnarchiveGlobalChatSessionRequest,
  ): Promise<UnarchiveGlobalChatSessionResult> =>
    runSql(
      options.databasePath,
      applyArchivedStateInTransaction({
        sessionId,
        commandId: input.commandId,
        archived: false,
      }),
    ),

  completeTurn: async (input: {
    readonly commandId: string;
    readonly sessionId: string;
    readonly turnId: string;
    readonly text: string;
    readonly parts?: readonly StoredConversationPart[];
    readonly messages: readonly {
      readonly id: string;
      readonly text: string;
      readonly parts?: readonly StoredConversationPart[];
    }[];
  }): Promise<SubmitGlobalChatSessionPromptResult> =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const rows = yield* getSession(sql, input.sessionId);
            const turnRows =
              yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
            if (!rows[0] || !turnRows[0])
              throw new GlobalChatSessionServiceError(
                "global_chat_session_unavailable",
              );
            if (!["queued", "running"].includes(turnRows[0].state))
              throw new GlobalChatSessionServiceError("turn_not_active");
            const now = new Date().toISOString();
            const messages = input.messages;
            let sequence = rows[0].last_sequence;
            for (const message of messages) {
              sequence += 1;
              const contentPartsJson = storedMessagePartsJson(message.parts);
              const eventParts = hydrateParts({
                messageId: message.id,
                turnId: input.turnId,
                text: message.text,
                partsJson: contentPartsJson,
              });
              yield* appendEvent({
                sql,
                sessionId: input.sessionId,
                sequence,
                payload: {
                  type: "GlobalChatAgentMessageCompletedV1",
                  version: 1,
                  sessionId: input.sessionId,
                  turnId: input.turnId,
                  messageId: message.id,
                  text: message.text,
                  parts: eventParts,
                  timestamp: now,
                },
                createdAt: now,
              });
              yield* sql`INSERT INTO chat_session_messages (session_id, message_id, role, text, content_parts_json, sequence, turn_id, created_at) VALUES (${input.sessionId}, ${message.id}, 'assistant', ${message.text}, ${contentPartsJson}, ${sequence}, ${input.turnId}, ${now})`;
            }
            const assistantMessageIds = messages.map((message) => message.id);
            const draftPartsJson = storedPartsJson(input.parts);
            yield* sql`UPDATE chat_session_turns SET state = 'completed', draft_text = ${input.text}, draft_parts_json = ${draftPartsJson}, draft_messages_json = NULL, assistant_message_ids_json = ${JSON.stringify(assistantMessageIds)}, updated_at = ${now} WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
            yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${input.sessionId}`;
            yield* sql`UPDATE chat_session_command_receipts SET status = 'succeeded', committed_sequence = ${sequence}, updated_at = ${now} WHERE command_id = ${input.commandId}`;
            const userRows = yield* getMessageById(
              sql,
              input.sessionId,
              turnRows[0].user_message_id,
            );
            const updated = yield* getSession(sql, input.sessionId);
            const updatedTurn =
              yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
            if (!userRows[0] || !updated[0] || !updatedTurn[0])
              throw new GlobalChatSessionServiceError(
                "global_chat_session_unavailable",
              );
            return {
              session: toSummary(updated[0]),
              turn: toTurn(updatedTurn[0]),
              userMessage: toMessage(userRows[0]),
            };
          }),
        );
      }),
    ),

  failTurn: async (input: {
    readonly commandId: string;
    readonly sessionId: string;
    readonly turnId: string;
    readonly reason: GlobalChatSessionTurnFailureReason;
  }): Promise<void> => {
    await runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const rows = yield* getSession(sql, input.sessionId);
            const turnRows =
              yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
            if (!rows[0] || !turnRows[0]) return;
            if (!["queued", "running"].includes(turnRows[0].state)) return;
            const details = failureDetails(input.reason);
            if (!details) return;
            const now = new Date().toISOString();
            const sequence = rows[0].last_sequence + 1;
            yield* appendEvent({
              sql,
              sessionId: input.sessionId,
              sequence,
              payload: {
                type: "GlobalChatAgentTurnFailedV1",
                version: 1,
                sessionId: input.sessionId,
                turnId: input.turnId,
                reason: input.reason,
                failureCategory: details.failureCategory,
                retryable: details.retryable,
                ...(details.retryAfterMs === undefined
                  ? {}
                  : { retryAfterMs: details.retryAfterMs }),
                timestamp: now,
              },
              createdAt: now,
            });
            yield* sql`UPDATE chat_session_turns SET state = 'failed', failure_reason = ${input.reason}, updated_at = ${now} WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
            yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${input.sessionId}`;
            yield* sql`UPDATE chat_session_command_receipts SET status = 'failed', terminal_error_code = ${input.reason}, committed_sequence = ${sequence}, updated_at = ${now} WHERE command_id = ${input.commandId}`;
          }),
        );
      }),
    );
  },

  interruptTurn: async (input: {
    readonly sessionId: string;
    readonly turnId: string;
    readonly reason: GlobalChatSessionTurnInterruptReason;
  }): Promise<InterruptGlobalChatSessionTurnResult> =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const rows = yield* getSession(sql, input.sessionId);
            if (!rows[0])
              throw new GlobalChatSessionServiceError(
                "global_chat_session_not_found",
              );
            const turnRows =
              yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
            if (!turnRows[0])
              throw new GlobalChatSessionServiceError("turn_not_found");
            if (turnRows[0].state === "interrupted")
              return { session: toSummary(rows[0]), turn: toTurn(turnRows[0]) };
            if (!["queued", "running"].includes(turnRows[0].state))
              throw new GlobalChatSessionServiceError("turn_not_active");
            const now = new Date().toISOString();
            const sequence = rows[0].last_sequence + 1;
            yield* appendEvent({
              sql,
              sessionId: input.sessionId,
              sequence,
              payload: {
                type: "GlobalChatAgentTurnInterruptedV1",
                version: 1,
                sessionId: input.sessionId,
                turnId: input.turnId,
                reason: input.reason,
                timestamp: now,
              },
              createdAt: now,
            });
            yield* sql`UPDATE chat_session_turns SET state = 'interrupted', failure_reason = ${input.reason}, updated_at = ${now} WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
            yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${input.sessionId}`;
            yield* sql`UPDATE chat_session_command_receipts SET status = 'failed', terminal_error_code = 'agent_turn_failed', committed_sequence = ${sequence}, updated_at = ${now} WHERE command_id = ${turnRows[0].command_id}`;
            const updated = yield* getSession(sql, input.sessionId);
            const updatedTurn =
              yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
            if (!updated[0] || !updatedTurn[0])
              throw new GlobalChatSessionServiceError(
                "global_chat_session_unavailable",
              );
            return {
              session: toSummary(updated[0]),
              turn: toTurn(updatedTurn[0]),
            };
          }),
        );
      }),
    ),

  checkpointTurnDraft: async (input: {
    readonly sessionId: string;
    readonly turnId: string;
    readonly text: string;
    readonly parts?: readonly StoredConversationPart[];
    readonly messages: readonly StoredDraftMessage[];
  }): Promise<void> => {
    await runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const rows = yield* getSession(sql, input.sessionId);
            const turnRows =
              yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
            if (!rows[0] || !turnRows[0]) return;
            if (!["queued", "running"].includes(turnRows[0].state)) return;
            const now = new Date().toISOString();
            const messages = input.messages;
            const contentPartsJson = storedPartsJson(input.parts);
            const draftMessagesJson = storedDraftMessagesJson(messages);
            let sequence = rows[0].last_sequence;
            for (const message of messages) {
              sequence += 1;
              const eventPartsJson = storedMessagePartsJson(message.parts);
              const eventParts = hydrateParts({
                messageId: message.id,
                turnId: input.turnId,
                text: message.text,
                partsJson: eventPartsJson,
              });
              yield* appendEvent({
                sql,
                sessionId: input.sessionId,
                sequence,
                payload: {
                  type: "GlobalChatAgentMessageCheckpointedV1",
                  version: 1,
                  sessionId: input.sessionId,
                  turnId: input.turnId,
                  messageId: message.id,
                  text: message.text,
                  parts: eventParts,
                  timestamp: now,
                },
                createdAt: now,
              });
            }
            yield* sql`UPDATE chat_session_turns SET draft_text = ${input.text}, draft_parts_json = ${contentPartsJson}, draft_messages_json = ${draftMessagesJson}, assistant_message_ids_json = ${JSON.stringify(messages.map((message) => message.id))}, updated_at = ${now} WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
            yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${input.sessionId}`;
          }),
        );
      }),
    );
  },

  recordToolStarted: async (input: {
    readonly sessionId: string;
    readonly turnId: string;
    readonly toolCallId: string;
    readonly toolName: string;
    readonly arguments?: Extract<
      StoredConversationPart,
      { readonly type: "tool-call" }
    >["arguments"];
    readonly safety?: "read" | "write" | "dangerous";
    readonly approvalStatus?: "approved" | "requires_approval";
    readonly approvalReason?: string;
  }): Promise<void> => {
    await runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const rows = yield* getSession(sql, input.sessionId);
        if (!rows[0]) return;
        const now = new Date().toISOString();
        const sequence = rows[0].last_sequence + 1;
        yield* appendEvent({
          sql,
          sessionId: input.sessionId,
          sequence,
          payload: {
            type: "GlobalChatAgentToolCallStartedV1",
            version: 1,
            sessionId: input.sessionId,
            turnId: input.turnId,
            toolCallId: input.toolCallId,
            toolName: input.toolName,
            ...(input.arguments === undefined
              ? {}
              : { arguments: input.arguments }),
            ...(input.safety === undefined ? {} : { safety: input.safety }),
            ...(input.approvalStatus === undefined
              ? {}
              : { approvalStatus: input.approvalStatus }),
            ...(input.approvalReason === undefined
              ? {}
              : { approvalReason: input.approvalReason }),
            timestamp: now,
          },
          createdAt: now,
        });
        yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${input.sessionId}`;
      }),
    );
  },

  recordToolCompleted: async (input: {
    readonly sessionId: string;
    readonly turnId: string;
    readonly toolCallId: string;
    readonly toolName: string;
    readonly isError: boolean;
    readonly result?: Extract<
      StoredConversationPart,
      { readonly type: "tool-call" }
    >["result"];
    readonly safety?: "read" | "write" | "dangerous";
    readonly approvalStatus?: "approved" | "requires_approval";
    readonly approvalReason?: string;
  }): Promise<void> => {
    await runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const rows = yield* getSession(sql, input.sessionId);
        if (!rows[0]) return;
        const now = new Date().toISOString();
        const sequence = rows[0].last_sequence + 1;
        yield* appendEvent({
          sql,
          sessionId: input.sessionId,
          sequence,
          payload: {
            type: "GlobalChatAgentToolCallCompletedV1",
            version: 1,
            sessionId: input.sessionId,
            turnId: input.turnId,
            toolCallId: input.toolCallId,
            toolName: input.toolName,
            status: input.isError ? "failed" : "succeeded",
            ...(input.result === undefined ? {} : { result: input.result }),
            ...(input.safety === undefined ? {} : { safety: input.safety }),
            ...(input.approvalStatus === undefined
              ? {}
              : { approvalStatus: input.approvalStatus }),
            ...(input.approvalReason === undefined
              ? {}
              : { approvalReason: input.approvalReason }),
            timestamp: now,
          },
          createdAt: now,
        });
        yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${input.sessionId}`;
      }),
    );
  },

  listTurnHistoryBefore: async (
    sessionId: string,
    sequence: number,
  ): Promise<
    readonly { readonly role: "user" | "assistant"; readonly text: string }[]
  > =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const rows = yield* getSession(sql, sessionId);
        if (!rows[0])
          throw new GlobalChatSessionServiceError(
            "global_chat_session_not_found",
          );
        const messages =
          yield* sql<MessageRow>`SELECT * FROM chat_session_messages WHERE session_id = ${sessionId} AND sequence < ${sequence} ORDER BY sequence ASC`;
        return messages.map((message) => ({
          role: message.role,
          text: message.text,
        }));
      }),
    ),

  listMessages: async (
    sessionId: string,
    pageOptions?: { readonly beforeSequence?: number; readonly limit?: number },
  ): Promise<ListGlobalChatSessionMessagesResult> =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const rows = yield* getSession(sql, sessionId);
        if (!rows[0])
          throw new GlobalChatSessionServiceError(
            "global_chat_session_not_found",
          );
        const messagePage = yield* listMessagePage(sql, sessionId, pageOptions);
        const activeTurns =
          yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${sessionId} AND state IN ('queued', 'running', 'recovery_required') ORDER BY updated_at DESC LIMIT 1`;
        const latestTurns =
          yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${sessionId} ORDER BY updated_at DESC, turn_id DESC LIMIT 1`;
        const pageInfo = messagePageInfo(messagePage, pageOptions);
        return {
          session: toSummary(rows[0]),
          messages: messagePage.rows.map(toMessage),
          ...(activeTurns[0] ? { activeTurn: toTurn(activeTurns[0]) } : {}),
          ...(latestTurns[0] ? { latestTurn: toTurn(latestTurns[0]) } : {}),
          ...(pageInfo === undefined ? {} : { pageInfo }),
        };
      }),
    ),

  listEventsAfter: async (
    sessionId: string,
    after: number,
  ): Promise<readonly GlobalChatSessionEventEnvelope[]> =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const rows = yield* getSession(sql, sessionId);
        if (!rows[0])
          throw new GlobalChatSessionServiceError(
            "global_chat_session_not_found",
          );
        const eventRows =
          yield* sql<EventRow>`SELECT session_id, sequence, event_type, event_payload_json, created_at FROM chat_session_events WHERE session_id = ${sessionId} AND sequence > ${after} ORDER BY sequence ASC`;
        return eventRows.map(toEventEnvelope);
      }),
    ),

  markTurnRecoveryRequired: async (input: {
    readonly sessionId: string;
    readonly turnId: string;
  }): Promise<void> => {
    await runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const turnRows =
              yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
            const sessions = yield* getSession(sql, input.sessionId);
            if (!turnRows[0] || !sessions[0]) return;
            if (!["queued", "running"].includes(turnRows[0].state)) return;
            const now = new Date().toISOString();
            const sequence = sessions[0].last_sequence + 1;
            yield* appendEvent({
              sql,
              sessionId: input.sessionId,
              sequence,
              payload: {
                type: "GlobalChatAgentTurnFailedV1",
                version: 1,
                sessionId: input.sessionId,
                turnId: input.turnId,
                reason: "global_chat_session_recovery_required",
                failureCategory: "system",
                retryable: false,
                timestamp: now,
              },
              createdAt: now,
            });
            yield* sql`UPDATE chat_session_turns SET state = 'recovery_required', failure_reason = 'global_chat_session_recovery_required', updated_at = ${now} WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
            yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${input.sessionId}`;
            yield* sql`UPDATE chat_session_command_receipts SET status = 'recovery_required', terminal_error_code = 'global_chat_session_recovery_required', committed_sequence = ${sequence}, updated_at = ${now} WHERE command_id = ${turnRows[0].command_id}`;
          }),
        );
      }),
    );
  },

  markInFlightTurnsRecoveryRequired: async (): Promise<void> => {
    await runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const rows =
          yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE state IN ('queued', 'running')`;
        for (const turn of rows) {
          yield* sql.withTransaction(
            Effect.gen(function* () {
              const sessions = yield* getSession(sql, turn.session_id);
              if (!sessions[0]) return;
              const now = new Date().toISOString();
              const sequence = sessions[0].last_sequence + 1;
              yield* appendEvent({
                sql,
                sessionId: turn.session_id,
                sequence,
                payload: {
                  type: "GlobalChatAgentTurnFailedV1",
                  version: 1,
                  sessionId: turn.session_id,
                  turnId: turn.turn_id,
                  reason: "global_chat_session_recovery_required",
                  failureCategory: "system",
                  retryable: false,
                  timestamp: now,
                },
                createdAt: now,
              });
              yield* sql`UPDATE chat_session_turns SET state = 'recovery_required', failure_reason = 'global_chat_session_recovery_required', updated_at = ${now} WHERE session_id = ${turn.session_id} AND turn_id = ${turn.turn_id}`;
              yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${turn.session_id}`;
              yield* sql`UPDATE chat_session_command_receipts SET status = 'recovery_required', terminal_error_code = 'global_chat_session_recovery_required', committed_sequence = ${sequence}, updated_at = ${now} WHERE command_id = ${turn.command_id}`;
            }),
          );
        }
      }),
    );
  },
});
