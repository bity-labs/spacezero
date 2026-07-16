import { z } from 'zod'

export type StorageSettings = {
  /** User-owned root for Space Zero-managed workspace content. */
  spaceZeroHome: string
  /** Default location for projects and repositories created by Space Zero. */
  projectsPath: string
}

export const storageDirectoryPathSchema = z.string().trim().min(1)
