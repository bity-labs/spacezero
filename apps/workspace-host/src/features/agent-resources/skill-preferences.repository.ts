import { SqliteClient } from "@effect/sql-sqlite-node";
import { Effect } from "effect";
import { SqlClient } from "effect/unstable/sql/SqlClient";

interface SkillPreferenceRow {
  readonly skill_name: string;
  readonly enabled: number;
  readonly updated_at: string;
}

export interface SkillPreferencesRepository {
  /** Skill names currently disabled by user preference for global scopes. */
  readonly listDisabledSkillNames: () => Promise<ReadonlySet<string>>;
  /** Persists an enable/disable preference for a skill name (test seam until
   * the Settings skill-toggle slice writes these rows). */
  readonly setEnabled: (input: {
    readonly name: string;
    readonly enabled: boolean;
  }) => Promise<void>;
}

export const createSkillPreferencesRepository = (options: {
  readonly databasePath: string;
}): SkillPreferencesRepository => ({
  listDisabledSkillNames: async () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        const rows =
          yield* sql<SkillPreferenceRow>`SELECT skill_name, enabled, updated_at FROM skill_preferences WHERE enabled = 0`;
        return new Set(rows.map((row) => row.skill_name));
      }).pipe(
        Effect.provide(SqliteClient.layer({ filename: options.databasePath })),
      ),
    ),

  setEnabled: async (input) => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        yield* sql`
INSERT INTO skill_preferences (skill_name, enabled, updated_at)
VALUES (${input.name}, ${input.enabled ? 1 : 0}, ${new Date().toISOString()})
ON CONFLICT(skill_name) DO UPDATE SET
  enabled = excluded.enabled,
  updated_at = excluded.updated_at`;
      }).pipe(
        Effect.provide(SqliteClient.layer({ filename: options.databasePath })),
      ),
    );
  },
});
