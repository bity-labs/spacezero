import { and, asc, eq } from 'drizzle-orm'

import { getDatabase } from '../../../main/db'
import * as schema from '../../../main/db/schema'
import type { PersistedTerminalTab, TerminalTabsRepository } from './terminal.service'
import type { TerminalContext } from '../shared'

export function createTerminalTabsRepository(): TerminalTabsRepository {
  return {
    async listByContext(context) {
      const rows = await getDatabase()
        .select()
        .from(schema.terminalTabs)
        .where(contextWhere(context))
        .orderBy(asc(schema.terminalTabs.sortOrder))

      return rows.map(rowToTab)
    },

    async upsert(tab) {
      await getDatabase()
        .insert(schema.terminalTabs)
        .values(tabToRow(tab))
        .onConflictDoUpdate({
          target: [schema.terminalTabs.contextKey, schema.terminalTabs.tabId],
          set: {
            sortOrder: tab.order,
            title: tab.title,
            active: tab.active ? 1 : 0,
            cwd: tab.cwd,
            updatedAt: new Date()
          }
        })
    },

    async replaceContext(context, tabs) {
      getDatabase().transaction((tx) => {
        tx.delete(schema.terminalTabs).where(contextWhere(context)).run()
        if (tabs.length > 0) {
          tx.insert(schema.terminalTabs).values(tabs.map(tabToRow)).run()
        }
      })
    },

    async updateOrderAndActive(context, orderedTabIds, activeTabId) {
      for (const [order, tabId] of orderedTabIds.entries()) {
        await getDatabase()
          .update(schema.terminalTabs)
          .set({ sortOrder: order, active: tabId === activeTabId ? 1 : 0, updatedAt: new Date() })
          .where(and(contextWhere(context), eq(schema.terminalTabs.tabId, tabId)))
      }
    },

    async updateCwdAndTitle(context, tabId, cwd, title) {
      await getDatabase()
        .update(schema.terminalTabs)
        .set({ cwd, title, updatedAt: new Date() })
        .where(and(contextWhere(context), eq(schema.terminalTabs.tabId, tabId)))
    },

    async deleteTab(context, tabId) {
      await getDatabase()
        .delete(schema.terminalTabs)
        .where(and(contextWhere(context), eq(schema.terminalTabs.tabId, tabId)))
    },

    async deleteContext(context) {
      await getDatabase().delete(schema.terminalTabs).where(contextWhere(context))
    }
  }
}

function tabToRow(tab: PersistedTerminalTab): typeof schema.terminalTabs.$inferInsert {
  return {
    contextKey: contextKey(tab.context),
    contextKind: tab.context.kind,
    contextSessionId:
      tab.context.kind === 'project-home'
        ? tab.context.projectId
        : 'sessionId' in tab.context
          ? tab.context.sessionId
          : null,
    tabId: tab.tabId,
    sortOrder: tab.order,
    title: tab.title,
    active: tab.active ? 1 : 0,
    cwd: tab.cwd,
    updatedAt: new Date()
  }
}

function rowToTab(row: typeof schema.terminalTabs.$inferSelect): PersistedTerminalTab {
  return {
    tabId: row.tabId,
    context: rowToContext(row.contextKind, row.contextSessionId),
    order: row.sortOrder,
    title: row.title,
    active: row.active === 1,
    cwd: row.cwd
  }
}

function rowToContext(kind: string, sessionId: string | null): TerminalContext {
  if (kind === 'global-chat') return { kind: 'global-chat' }
  if (kind === 'knowledge-base') return { kind: 'knowledge-base' }
  if (kind === 'project-home' && sessionId) return { kind, projectId: sessionId }
  if (kind === 'project-session' && sessionId) return { kind, sessionId }
  if (kind === 'workspace-session' && sessionId) return { kind, sessionId }
  throw new Error('terminal.invalidPersistedContext')
}

function contextWhere(context: TerminalContext) {
  return eq(schema.terminalTabs.contextKey, contextKey(context))
}

function contextKey(context: TerminalContext): string {
  if (context.kind === 'knowledge-base' || context.kind === 'global-chat') return context.kind
  if (context.kind === 'project-home') return `${context.kind}:${context.projectId}`
  return `${context.kind}:${context.sessionId}`
}
