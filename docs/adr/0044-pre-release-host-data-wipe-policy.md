# ADR 0044: Pre-release Host data wipe policy

## Status

Accepted

## Context

Space Zero is pre-release: no Host data has shipped to any user, and every existing Workspace Host SQLite database is local development data. The conversation model is still changing — most recently PR #569 (issue #568) added multi-message agent turns, which required additive columns and backfill migrations (migrations 9 and 10) plus legacy compatibility paths that treat turns without multi-message data as single-message turns.

Maintaining versioned, data-preserving migrations and backfill/compatibility code for disposable dev data has real cost: every conversation schema change must carry legacy read/write paths, legacy-shaped tests, and migration logic that exists only to keep rows no user ever created. ADR [0028](0028-event-source-the-project-session-domain-in-sqlite.md) requires numbered transactional migrations and rebuildable projections; ADR [0043](0043-use-assistant-ui-over-host-owned-structured-conversations.md) states that existing text-only histories remain readable. Those rules are the correct long-term doctrine but impose backfill and compatibility obligations that only matter once data is durable in the wild.

After the v0.1 public release, Host SQLite data becomes real user history and destructive shortcuts are unacceptable; event and schema versioning with compatibility becomes mandatory (ADR 0028 doctrine, PRD #544).

## Decision

Until Space Zero v0.1 is publicly released, the Workspace Host may satisfy Host durable-data schema changes by **destructively wiping** Host SQLite data instead of writing versioned or backfill migrations for it. Concretely:

- On startup, the Host records and checks a durable-data schema version. If a persisted database's schema version is below the current required version, the Host deletes the affected durable Host data — conversation/session tables, the Session Event Journal, projections, follow-ups, command receipts; in practice the whole Host database file, which is simpler and safe under this policy — and recreates it at the current version by running the normal migration chain from empty.
- The wipe must be **fail-closed and one-way**. The Host wipes only when the pre-wipe state can be proven safe to recreate (readable version record, no contradictory state). If the pre-wipe state cannot be proven — unreadable or missing version record while Host tables exist, or a version from a newer build — the Host refuses to start rather than half-migrating or wiping blindly. There is no downgrade path and no automatic archive.
- Migrations that existed only to backfill or rewrite legacy rows (migrations 9 and 10 for multi-message turns) lose their backfill semantics; the wipe replaces them. The final schema shape is preserved.
- This policy **deliberately supersedes the pre-release applicability** of ADR [0043](0043-use-assistant-ui-over-host-owned-structured-conversations.md)'s consequence that "existing text-only histories remain readable", for conversation data: pre-release, old conversation rows are wiped, not kept readable, and the multi-message turn contract becomes required instead of optional-with-fallback.
- When v0.1 is publicly released, this policy expires: from that point, Host durable-data schema changes must use versioned, data-preserving migrations with event compatibility, per ADR 0028 and PRD #544 doctrine.

## Rationale

Every existing Host database is disposable development data. Wiping converts per-change backfill migrations and permanent legacy compatibility paths into a one-time destructive reset, letting contracts tighten (for example, required multi-message turn fields) without carrying dead fallback code. Fail-closed refusal prevents a corrupt or newer database from being silently destroyed or half-migrated. Making the policy explicit in an ADR — instead of an undocumented `DELETE FROM` — keeps the post-release switch to mandatory compatibility auditable.

## Consequences

- Conversation and session code may assume the current contract shapes; legacy fallbacks for older row shapes must be removed, not maintained.
- Any Host schema change pre-release increments the required data version; developer Host data is wiped on next start.
- The wipe is destructive by design: Project Session managed worktrees and branches referenced only by wiped bindings may be left orphaned on disk for developers to reclaim manually; dev data must be treated as disposable.
- The wipe path itself needs tests: seeded old-version databases are recreated at the current version and operate; unprovable pre-wipe states refuse to start.
- After public release, this ADR must be marked Superseded or narrowed, and versioned compatibility becomes mandatory before any schema change ships to users.

## Alternatives Considered

- **Keep versioned/backfill migrations until release** — rejected: it keeps permanent legacy paths and test weight for data no user has.
- **Wipe only conversation tables, preserve the rest** — considered; a whole-database recreation is simpler, provably consistent (fresh migration chain), and safe under the disposable-data premise.
- **Archive the old database beside the new one** — rejected: dev-only data does not justify archive lifecycle, and it would keep the temptation to restore incompatible shapes.

## Review Trigger

Revisit when Space Zero v0.1 is publicly released (policy expires) or when any real (non-developer) Host data exists earlier than planned.
