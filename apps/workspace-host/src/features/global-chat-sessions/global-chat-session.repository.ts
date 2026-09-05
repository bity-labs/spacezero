import { createHash, randomUUID } from "node:crypto";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import {
  deriveGlobalChatSessionInitialTitle,
  type CreateGlobalChatSessionWithFirstPromptRequest,
  type CreateGlobalChatSessionWithFirstPromptResult,
  type GetGlobalChatSessionRuntimeResult,
  type GlobalChatSessionEvent,
  type GlobalChatSessionEventEnvelope,
  type GlobalChatSessionMessage,
  type GlobalChatSessionRuntimeConfiguration,
  type GlobalChatSessionSummary,
  type GlobalChatSessionTurn,
  type InterruptGlobalChatSessionTurnResult,
  type ListGlobalChatSessionMessagesResult,
  type ListGlobalChatSessionsResult,
  type SubmitGlobalChatSessionPromptRequest,
  type SubmitGlobalChatSessionPromptResult,
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
  readonly sequence: number;
  readonly turn_id: string | null;
  readonly created_at: string;
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
    | "off"
    | "minimal"
    | "low"
    | "medium"
    | "high"
    | "xhigh"
    | "max";
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
      return { failureCategory: "provider", retryable: true, retryAfterMs: 30_000 };
    case "agent_turn_failed":
      return { failureCategory: "provider", retryable: true };
  }
};

const toSummary = (row: SessionRow): GlobalChatSessionSummary => ({
  id: row.session_id,
  title: row.title,
  archived: row.archived_at !== null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastSequence: row.last_sequence,
});

const toMessage = (row: MessageRow): GlobalChatSessionMessage => ({
  id: row.message_id,
  role: row.role,
  text: row.text,
  sequence: row.sequence,
  createdAt: row.created_at,
});

const toTurn = (row: TurnRow): GlobalChatSessionTurn => {
  const details = row.failure_reason
    ? failureDetails(row.failure_reason as GlobalChatSessionTurnFailureReason)
    : undefined;
  return {
    id: row.turn_id,
    commandId: row.command_id,
    state: row.state,
    userMessageId: row.user_message_id,
    assistantMessageId: row.assistant_message_id,
    providerId: row.provider_id,
    modelId: row.model_id,
    thinkingLevel: row.thinking_level,
    draftText: row.draft_text,
    ...(row.failure_reason === null ? {} : { failureReason: row.failure_reason }),
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

const getMessageById = (
  sql: SqlClient,
  sessionId: string,
  messageId: string,
) =>
  sql<MessageRow>`SELECT * FROM chat_session_messages WHERE session_id = ${sessionId} AND message_id = ${messageId}`;

const getFirstMessage = (sql: SqlClient, sessionId: string) =>
  sql<MessageRow>`SELECT * FROM chat_session_messages WHERE session_id = ${sessionId} AND role = 'user' ORDER BY sequence ASC LIMIT 1`;

const getPiConversationId = (sql: SqlClient, sessionId: string) =>
  Effect.gen(function* () {
    const rows = yield* sql<PiContextRow>`SELECT conversation_id FROM chat_session_pi_contexts WHERE session_id = ${sessionId}`;
    if (!rows[0])
      throw new GlobalChatSessionServiceError("global_chat_session_unavailable");
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
    const turnRows = yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE command_id = ${receipt.command_id}`;
    if (!sessions[0] || !turnRows[0])
      throw new GlobalChatSessionServiceError("global_chat_session_unavailable");
    const messages = yield* getMessageById(
      sql,
      sessionId,
      turnRows[0].user_message_id,
    );
    if (!messages[0])
      throw new GlobalChatSessionServiceError("global_chat_session_unavailable");
    return {
      session: toSummary(sessions[0]),
      turn: toTurn(turnRows[0]),
      userMessage: toMessage(messages[0]),
    } as Result;
  });

const replayCreateResult = (sql: SqlClient, sessionId: string) =>
  Effect.gen(function* () {
    const result = yield* replayPromptResult<CreateGlobalChatSessionWithFirstPromptResult>(
      sql,
      sessionId,
      (yield* sql<ReceiptRow>`SELECT * FROM chat_session_command_receipts WHERE session_id = ${sessionId} ORDER BY created_at ASC LIMIT 1`)[0]!,
    );
    const firstMessage = yield* getFirstMessage(sql, sessionId);
    if (!firstMessage[0])
      throw new GlobalChatSessionServiceError("global_chat_session_unavailable");
    return { ...result, firstMessage: toMessage(firstMessage[0]) };
  });

const ensureOpen = (row: SessionRow): void => {
  if (row.archived_at !== null)
    throw new GlobalChatSessionServiceError("global_chat_session_archived");
};

const admitPromptInTransaction = <Result extends SubmitGlobalChatSessionPromptResult>(
  input: {
    readonly sql: SqlClient;
    readonly sessionId: string;
    readonly commandId: string;
    readonly prompt: string;
    readonly fingerprint: string;
  },
) =>
  Effect.gen(function* () {
    const receipt = yield* input.sql<ReceiptRow>`SELECT * FROM chat_session_command_receipts WHERE command_id = ${input.commandId}`;
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
    const runtimeRows = yield* input.sql<RuntimeConfigurationRow>`SELECT * FROM chat_session_runtime_configurations WHERE session_id = ${input.sessionId}`;
    if (!runtimeRows[0])
      throw new GlobalChatSessionServiceError("global_chat_session_unavailable");
    const activeTurns = yield* input.sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND state IN ('queued', 'running') LIMIT 1`;
    if (activeTurns[0])
      throw new GlobalChatSessionServiceError(
        "global_chat_session_turn_in_progress",
      );
    const conversationId = yield* getPiConversationId(input.sql, input.sessionId);
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
    yield* input.sql`INSERT INTO chat_session_turns (session_id, turn_id, command_id, user_message_id, assistant_message_id, provider_id, model_id, thinking_level, state, draft_text, created_at, updated_at) VALUES (${input.sessionId}, ${turnId}, ${input.commandId}, ${userMessageId}, ${assistantMessageId}, ${runtime.providerId}, ${runtime.modelId}, ${runtime.defaultThinkingLevel}, 'running', '', ${now}, ${now})`;
    yield* input.sql`UPDATE chat_session_pi_contexts SET last_turn_id = ${turnId}, updated_at = ${now} WHERE session_id = ${input.sessionId}`;
    yield* input.sql`INSERT INTO chat_session_command_receipts (command_id, request_fingerprint, session_id, status, committed_sequence, created_at, updated_at) VALUES (${input.commandId}, ${input.fingerprint}, ${input.sessionId}, 'pending', ${baseSequence + 2}, ${now}, ${now})`;
    yield* input.sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${baseSequence + 2} WHERE session_id = ${input.sessionId}`;

    const updated = yield* getSession(input.sql, input.sessionId);
    const userRows = yield* getMessageById(input.sql, input.sessionId, userMessageId);
    const turnRows = yield* input.sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${turnId}`;
    if (!updated[0] || !userRows[0] || !turnRows[0])
      throw new GlobalChatSessionServiceError("global_chat_session_unavailable");
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

export const createGlobalChatSessionRepository = (options: {
  readonly databasePath: string;
}) => ({
  list: async (): Promise<ListGlobalChatSessionsResult> =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const rows = yield* sql<SessionRow>`SELECT * FROM chat_sessions WHERE kind = 'global' ORDER BY updated_at DESC, session_id DESC`;
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
            const receipt = yield* sql<ReceiptRow>`SELECT * FROM chat_session_command_receipts WHERE command_id = ${input.commandId}`;
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
            const admitted = yield* admitPromptInTransaction<CreateGlobalChatSessionWithFirstPromptResult>({
              sql,
              sessionId,
              commandId: input.commandId,
              prompt: firstPrompt,
              fingerprint: fp,
            });
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
        const runtimeRows = yield* sql<RuntimeConfigurationRow>`SELECT * FROM chat_session_runtime_configurations WHERE session_id = ${sessionId}`;
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
            const receipt = yield* sql<ReceiptRow>`SELECT * FROM chat_session_command_receipts WHERE command_id = ${input.commandId}`;
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
              const event = JSON.parse(runtimeEvents[0].event_payload_json) as Extract<
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
            const activeTurns = yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${sessionId} AND state IN ('queued', 'running') LIMIT 1`;
            if (activeTurns[0])
              throw new GlobalChatSessionServiceError(
                "global_chat_session_turn_in_progress",
              );
            const runtimeRows = yield* sql<RuntimeConfigurationRow>`SELECT * FROM chat_session_runtime_configurations WHERE session_id = ${sessionId}`;
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
            const updatedRuntime = yield* sql<RuntimeConfigurationRow>`SELECT * FROM chat_session_runtime_configurations WHERE session_id = ${sessionId}`;
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

  completeTurn: async (input: {
    readonly commandId: string;
    readonly sessionId: string;
    readonly turnId: string;
    readonly text: string;
  }): Promise<SubmitGlobalChatSessionPromptResult> =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const rows = yield* getSession(sql, input.sessionId);
            const turnRows = yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
            if (!rows[0] || !turnRows[0])
              throw new GlobalChatSessionServiceError(
                "global_chat_session_unavailable",
              );
            if (!["queued", "running"].includes(turnRows[0].state))
              throw new GlobalChatSessionServiceError("turn_not_active");
            const now = new Date().toISOString();
            const sequence = rows[0].last_sequence + 1;
            const messageId = turnRows[0].assistant_message_id;
            yield* appendEvent({
              sql,
              sessionId: input.sessionId,
              sequence,
              payload: {
                type: "GlobalChatAgentMessageCompletedV1",
                version: 1,
                sessionId: input.sessionId,
                turnId: input.turnId,
                messageId,
                text: input.text,
                timestamp: now,
              },
              createdAt: now,
            });
            yield* sql`INSERT INTO chat_session_messages (session_id, message_id, role, text, sequence, turn_id, created_at) VALUES (${input.sessionId}, ${messageId}, 'assistant', ${input.text}, ${sequence}, ${input.turnId}, ${now})`;
            yield* sql`UPDATE chat_session_turns SET state = 'completed', draft_text = ${input.text}, updated_at = ${now} WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
            yield* sql`UPDATE chat_sessions SET updated_at = ${now}, last_sequence = ${sequence} WHERE session_id = ${input.sessionId}`;
            yield* sql`UPDATE chat_session_command_receipts SET status = 'succeeded', committed_sequence = ${sequence}, updated_at = ${now} WHERE command_id = ${input.commandId}`;
            const userRows = yield* getMessageById(sql, input.sessionId, turnRows[0].user_message_id);
            const updated = yield* getSession(sql, input.sessionId);
            const updatedTurn = yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
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
            const turnRows = yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
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
            const turnRows = yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
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
            const updatedTurn = yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
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
  }): Promise<void> => {
    await runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const rows = yield* getSession(sql, input.sessionId);
            const turnRows = yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
            if (!rows[0] || !turnRows[0]) return;
            if (!["queued", "running"].includes(turnRows[0].state)) return;
            const now = new Date().toISOString();
            const sequence = rows[0].last_sequence + 1;
            yield* appendEvent({
              sql,
              sessionId: input.sessionId,
              sequence,
              payload: {
                type: "GlobalChatAgentMessageCheckpointedV1",
                version: 1,
                sessionId: input.sessionId,
                turnId: input.turnId,
                messageId: turnRows[0].assistant_message_id,
                text: input.text,
                timestamp: now,
              },
              createdAt: now,
            });
            yield* sql`UPDATE chat_session_turns SET draft_text = ${input.text}, updated_at = ${now} WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
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
  ): Promise<readonly { readonly role: "user" | "assistant"; readonly text: string }[]> =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const rows = yield* getSession(sql, sessionId);
        if (!rows[0])
          throw new GlobalChatSessionServiceError(
            "global_chat_session_not_found",
          );
        const messages = yield* sql<MessageRow>`SELECT * FROM chat_session_messages WHERE session_id = ${sessionId} AND sequence < ${sequence} ORDER BY sequence ASC`;
        return messages.map((message) => ({
          role: message.role,
          text: message.text,
        }));
      }),
    ),

  listMessages: async (
    sessionId: string,
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
        const messages = yield* sql<MessageRow>`SELECT * FROM chat_session_messages WHERE session_id = ${sessionId} ORDER BY sequence ASC`;
        const activeTurns = yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${sessionId} AND state IN ('queued', 'running', 'recovery_required') ORDER BY updated_at DESC LIMIT 1`;
        const latestTurns = yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${sessionId} ORDER BY updated_at DESC, turn_id DESC LIMIT 1`;
        return {
          session: toSummary(rows[0]),
          messages: messages.map(toMessage),
          ...(activeTurns[0] ? { activeTurn: toTurn(activeTurns[0]) } : {}),
          ...(latestTurns[0] ? { latestTurn: toTurn(latestTurns[0]) } : {}),
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
        const eventRows = yield* sql<EventRow>`SELECT session_id, sequence, event_type, event_payload_json, created_at FROM chat_session_events WHERE session_id = ${sessionId} AND sequence > ${after} ORDER BY sequence ASC`;
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
            const turnRows = yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE session_id = ${input.sessionId} AND turn_id = ${input.turnId}`;
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
        const rows = yield* sql<TurnRow>`SELECT * FROM chat_session_turns WHERE state IN ('queued', 'running')`;
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
