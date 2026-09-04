import { createHash, randomUUID } from "node:crypto";
import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import {
  deriveGlobalChatSessionInitialTitle,
  type CreateGlobalChatSessionWithFirstPromptRequest,
  type CreateGlobalChatSessionWithFirstPromptResult,
  type GlobalChatSessionEvent,
  type GlobalChatSessionMessage,
  type GlobalChatSessionSummary,
} from "@spacezero/host-contracts";
import { GlobalChatSessionServiceError } from "./global-chat-session.model.js";

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
  readonly created_at: string;
}

interface ReceiptRow {
  readonly command_id: string;
  readonly request_fingerprint: string;
  readonly session_id: string;
  readonly committed_sequence: number;
}

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
  sql<SessionRow>`SELECT * FROM global_chat_sessions WHERE session_id = ${sessionId}`;

const getFirstMessage = (sql: SqlClient, sessionId: string) =>
  sql<MessageRow>`SELECT * FROM global_chat_messages WHERE session_id = ${sessionId} AND role = 'user' ORDER BY sequence ASC LIMIT 1`;

const appendEvent = (input: {
  readonly sql: SqlClient;
  readonly sessionId: string;
  readonly sequence: number;
  readonly payload: GlobalChatSessionEvent;
  readonly createdAt: string;
}) =>
  input.sql`INSERT INTO global_chat_session_events (session_id, sequence, event_id, event_type, event_version, event_payload_json, created_at) VALUES (${input.sessionId}, ${input.sequence}, ${randomUUID()}, ${input.payload.type}, 1, ${JSON.stringify(input.payload)}, ${input.createdAt})`;

const replayCreateResult = (sql: SqlClient, sessionId: string) =>
  Effect.gen(function* () {
    const sessions = yield* getSession(sql, sessionId);
    const messages = yield* getFirstMessage(sql, sessionId);
    if (!sessions[0] || !messages[0])
      throw new GlobalChatSessionServiceError(
        "global_chat_session_unavailable",
      );
    return {
      session: toSummary(sessions[0]),
      firstMessage: toMessage(messages[0]),
    };
  });

export const createGlobalChatSessionRepository = (options: {
  readonly databasePath: string;
}) => ({
  createWithFirstPrompt: async (
    input: CreateGlobalChatSessionWithFirstPromptRequest,
  ): Promise<CreateGlobalChatSessionWithFirstPromptResult> =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const fp = createFingerprint(input);
        return yield* sql.withTransaction(
          Effect.gen(function* () {
            const receipt =
              yield* sql<ReceiptRow>`SELECT * FROM global_chat_session_command_receipts WHERE command_id = ${input.commandId}`;
            if (receipt[0]) {
              if (receipt[0].request_fingerprint !== fp)
                throw new GlobalChatSessionServiceError("command_id_conflict");
              return yield* replayCreateResult(sql, receipt[0].session_id);
            }

            const sessionId = randomUUID();
            const messageId = randomUUID();
            const now = new Date().toISOString();
            const firstPrompt = input.firstPrompt.trim();
            const title = deriveGlobalChatSessionInitialTitle(firstPrompt);
            const createdSequence = 1;
            const messageSequence = 2;

            yield* appendEvent({
              sql,
              sessionId,
              sequence: createdSequence,
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
              sequence: messageSequence,
              payload: {
                type: "GlobalChatUserMessageSubmittedV1",
                version: 1,
                sessionId,
                messageId,
                commandId: input.commandId,
                prompt: firstPrompt,
                timestamp: now,
              },
              createdAt: now,
            });
            yield* sql`INSERT INTO global_chat_sessions (session_id, title, archived_at, created_at, updated_at, last_sequence) VALUES (${sessionId}, ${title}, NULL, ${now}, ${now}, ${messageSequence})`;
            yield* sql`INSERT INTO global_chat_messages (session_id, message_id, role, text, sequence, created_at) VALUES (${sessionId}, ${messageId}, 'user', ${firstPrompt}, ${messageSequence}, ${now})`;
            yield* sql`INSERT INTO global_chat_session_command_receipts (command_id, request_fingerprint, session_id, committed_sequence, created_at, updated_at) VALUES (${input.commandId}, ${fp}, ${sessionId}, ${messageSequence}, ${now}, ${now})`;

            return yield* replayCreateResult(sql, sessionId);
          }),
        );
      }),
    ),
});
