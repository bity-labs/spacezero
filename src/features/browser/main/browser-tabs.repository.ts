import { asc, eq } from 'drizzle-orm'

import type { getDatabase } from '../../../main/db'
import * as schema from '../../../main/db/schema'
import type { BrowserContext } from '../shared'
import { browserContextKey } from '../shared'
import type { BrowserPersistedTab, BrowserTabsRepository } from './browser.service'

type DatabaseGetter = typeof getDatabase

export function createBrowserTabsRepository(getDb: DatabaseGetter): BrowserTabsRepository {
  return {
    async listByContext(context) {
      const rows = await getDb()
        .select()
        .from(schema.browserTabs)
        .where(eq(schema.browserTabs.contextKey, browserContextKey(context)))
        .orderBy(asc(schema.browserTabs.sortOrder))

      return rows.flatMap((row) => rowToPersistedTab(row, context) ?? [])
    },

    async replaceContext(context, tabs) {
      getDb().transaction((tx) => {
        tx.delete(schema.browserTabs)
          .where(eq(schema.browserTabs.contextKey, browserContextKey(context)))
          .run()
        if (tabs.length > 0) tx.insert(schema.browserTabs).values(tabs.map(tabToRow)).run()
      })
    },

    async deleteContext(context) {
      await getDb()
        .delete(schema.browserTabs)
        .where(eq(schema.browserTabs.contextKey, browserContextKey(context)))
    },

    async deleteContextKey(contextKey) {
      await getDb().delete(schema.browserTabs).where(eq(schema.browserTabs.contextKey, contextKey))
    }
  }
}

function tabToRow(tab: BrowserPersistedTab): typeof schema.browserTabs.$inferInsert {
  return {
    contextKey: browserContextKey(tab.context),
    contextKind: tab.context.kind,
    contextSessionId: 'sessionId' in tab.context ? tab.context.sessionId : null,
    contextProjectId: tab.context.kind === 'project-session' ? tab.context.projectId : null,
    tabId: tab.tabId,
    sortOrder: tab.order,
    active: tab.active ? 1 : 0,
    url: tab.url,
    updatedAt: new Date()
  }
}

function rowToPersistedTab(
  row: typeof schema.browserTabs.$inferSelect,
  requestedContext: BrowserContext
): BrowserPersistedTab | undefined {
  const context = rowToContext(row.contextKind, row.contextSessionId, row.contextProjectId)
  if (!context) return undefined
  if (browserContextKey(context) !== browserContextKey(requestedContext)) return undefined
  if (context.kind !== requestedContext.kind) return undefined
  if ('sessionId' in context && 'sessionId' in requestedContext) {
    if (context.sessionId !== requestedContext.sessionId) return undefined
  }
  if (context.kind === 'project-session' && requestedContext.kind === 'project-session') {
    if (context.projectId !== requestedContext.projectId) return undefined
  }

  return {
    context,
    tabId: row.tabId,
    order: row.sortOrder,
    active: row.active === 1,
    url: row.url
  }
}

function rowToContext(
  kind: string,
  sessionId: string | null,
  projectId: string | null
): BrowserContext | undefined {
  if (kind === 'global-chat') return { kind: 'global-chat' }
  if (kind === 'knowledge-base') return { kind: 'knowledge-base' }
  if (kind === 'workspace-session' && sessionId) return { kind, sessionId }
  if (kind === 'project-session' && sessionId && projectId) return { kind, sessionId, projectId }
  return undefined
}
