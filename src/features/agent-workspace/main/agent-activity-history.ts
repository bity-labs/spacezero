import type { AgentActivityRecord } from '../shared/workspace-tool.model'

/** Input for recording a Workspace Tool activity event. */
export type AgentActivityRecordInput = Omit<AgentActivityRecord, 'id' | 'recordedAt'>

export type AgentActivityHistoryInit = {
  now?: () => Date
  id?: () => string
}

function freezeRecord(record: AgentActivityRecord): AgentActivityRecord {
  if (record.error) {
    Object.freeze(record.error)
  }
  return Object.freeze(record)
}

function copyRecord(record: AgentActivityRecord): AgentActivityRecord {
  const copy: AgentActivityRecord = {
    id: record.id,
    toolName: record.toolName,
    outcome: record.outcome,
    recordedAt: record.recordedAt
  }

  if (record.safetyLevel) {
    copy.safetyLevel = record.safetyLevel
  }
  if (record.kind) {
    copy.kind = record.kind
  }
  if (record.domain) {
    copy.domain = record.domain
  }
  if (record.error) {
    copy.error = { code: record.error.code, message: record.error.message }
  }

  return copy
}

const sequentialId = (() => {
  let counter = 0
  return () => `rec-${(counter += 1)}`
})()

/**
 * Lightweight Agent Activity History for Workspace Tool calls.
 *
 * This is the storage boundary: it captures enough metadata to explain what
 * happened for visibility and debugging, without persisting full tool input or
 * output payloads by default. It is not a compliance-grade audit log.
 */
export interface AgentActivityHistory {
  record(entry: AgentActivityRecordInput): AgentActivityRecord
  list(): readonly AgentActivityRecord[]
}

/**
 * In-memory default Agent Activity History.
 *
 * Space Zero keeps activity history lightweight; the v0 boundary is in-memory
 * storage behind this interface so a durable implementation can be swapped in
 * later without changing callers.
 */
export class InMemoryAgentActivityHistory implements AgentActivityHistory {
  private readonly records: AgentActivityRecord[] = []
  private readonly now: () => Date
  private readonly id: () => string

  constructor(init: AgentActivityHistoryInit = {}) {
    this.now = init.now ?? (() => new Date())
    this.id = init.id ?? sequentialId
  }

  record(entry: AgentActivityRecordInput): AgentActivityRecord {
    const record = freezeRecord(
      copyRecord({
        id: this.id(),
        recordedAt: this.now().toISOString(),
        toolName: entry.toolName,
        outcome: entry.outcome,
        safetyLevel: entry.safetyLevel,
        kind: entry.kind,
        domain: entry.domain,
        error: entry.error ? { code: entry.error.code, message: entry.error.message } : undefined
      })
    )
    this.records.push(record)
    return record
  }

  list(): readonly AgentActivityRecord[] {
    // Return frozen copies so callers cannot mutate internal state or the snapshot.
    return Object.freeze(this.records.map((record) => freezeRecord(copyRecord(record))))
  }
}
