import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";
import type {
  AgentRuntimeDefaults,
  AgentThinkingLevel,
} from "@spacezero/host-contracts";

interface AgentRuntimeDefaultsRow {
  readonly default_provider_id: string | null;
  readonly default_model_id: string | null;
  readonly default_thinking_level: AgentThinkingLevel | null;
}

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

const toDefaults = (row: AgentRuntimeDefaultsRow | undefined) => {
  if (!row || row.default_provider_id === null || row.default_model_id === null)
    return {
      defaultModel: null,
      defaultThinkingLevel: row?.default_thinking_level ?? null,
    } satisfies AgentRuntimeDefaults;
  return {
    defaultModel: {
      providerId: row.default_provider_id,
      modelId: row.default_model_id,
    },
    defaultThinkingLevel: row.default_thinking_level,
  } satisfies AgentRuntimeDefaults;
};

export const getAgentRuntimeDefaults = (sql: SqlClient) =>
  Effect.gen(function* () {
    const rows =
      yield* sql<AgentRuntimeDefaultsRow>`SELECT default_provider_id, default_model_id, default_thinking_level FROM agent_runtime_defaults WHERE singleton = 1`;
    return toDefaults(rows[0]);
  });

export const createAgentRuntimeDefaultsRepository = (options: {
  readonly databasePath: string;
}) => ({
  get: async (): Promise<AgentRuntimeDefaults> =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        return yield* getAgentRuntimeDefaults(sql);
      }),
    ),

  put: async (defaults: AgentRuntimeDefaults): Promise<void> =>
    runSql(
      options.databasePath,
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const now = new Date().toISOString();
        const providerId = defaults.defaultModel?.providerId ?? null;
        const modelId = defaults.defaultModel?.modelId ?? null;
        yield* sql`
INSERT INTO agent_runtime_defaults (singleton, default_provider_id, default_model_id, default_thinking_level, updated_at)
VALUES (1, ${providerId}, ${modelId}, ${defaults.defaultThinkingLevel}, ${now})
ON CONFLICT(singleton) DO UPDATE SET
  default_provider_id = excluded.default_provider_id,
  default_model_id = excluded.default_model_id,
  default_thinking_level = excluded.default_thinking_level,
  updated_at = excluded.updated_at`;
      }),
    ),
});
