import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type { FilesGitStatus, FilesGitStatusEntry } from '../shared'

const execFileAsync = promisify(execFile)
const MAX_GIT_STATUS_OUTPUT_BYTES = 512 * 1024

export async function readFilesGitStatus(rootPath: string): Promise<FilesGitStatusEntry[]> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all'],
      {
        cwd: rootPath,
        encoding: 'utf8',
        maxBuffer: MAX_GIT_STATUS_OUTPUT_BYTES
      }
    )
    return parseFilesGitStatus(stdout).sort(compareGitStatusEntries)
  } catch {
    return []
  }
}

function parseFilesGitStatus(output: string): FilesGitStatusEntry[] {
  const records = output.split('\0').filter(Boolean)
  const statuses: FilesGitStatusEntry[] = []

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    const x = record[0] ?? ' '
    const y = record[1] ?? ' '
    const rawPath = record.slice(3)
    const status = mapPorcelainStatus(x, y)

    if (x === 'R' || x === 'C') index += 1
    const path = normalizeGitStatusPath(rawPath)
    if (!path) continue
    statuses.push({ path, status })
  }

  return statuses
}

function mapPorcelainStatus(x: string, y: string): FilesGitStatus {
  if (x === '?' && y === '?') return 'untracked'
  if (x === '!' && y === '!') return 'ignored'
  if (x === 'R' || x === 'C') return 'renamed'
  if (x === 'A' || y === 'A') return 'added'
  if (x === 'D' || y === 'D') return 'deleted'
  return 'modified'
}

function normalizeGitStatusPath(path: string): string | null {
  if (
    !path ||
    path.includes('\0') ||
    path.includes('\\') ||
    path.startsWith('/') ||
    /^[a-z]:/i.test(path)
  ) {
    return null
  }
  const segments = path.split('/')
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        segment.toLowerCase() === '.git'
    )
  ) {
    return null
  }
  return path
}

function compareGitStatusEntries(left: FilesGitStatusEntry, right: FilesGitStatusEntry): number {
  return left.path.localeCompare(right.path, undefined, { sensitivity: 'base', numeric: true })
}
