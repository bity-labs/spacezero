import { z } from 'zod'

export type StorageSettings = {
  /** User-owned root for Space Zero-managed workspace content. */
  spaceZeroHome: string
  /** Default location for projects and repositories created by Space Zero. */
  projectsPath: string
  /** Root for per-Session Git worktrees managed by Space Zero. */
  worktreesPath: string
}

export const storageDirectoryPathSchema = z.string().trim().min(1)
