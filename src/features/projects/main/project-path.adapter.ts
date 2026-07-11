import { app, dialog } from 'electron'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'

import type { ProjectPathAdapter } from './projects.service'

export function createProjectPathAdapter(): ProjectPathAdapter {
  return {
    async createEmptyProjectDirectory(name) {
      const basePath = join(app.getPath('home'), 'ws', 'dev')
      mkdirSync(basePath, { recursive: true })

      const baseSlug = slugify(name) || 'project'
      let candidate = join(basePath, baseSlug)
      let suffix = 2

      while (existsSync(candidate)) {
        candidate = join(basePath, `${baseSlug}-${suffix}`)
        suffix += 1
      }

      mkdirSync(candidate, { recursive: true })
      return candidate
    },

    async chooseProjectFolder() {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory'],
        title: 'Open project folder'
      })

      const [selectedPath] = result.filePaths
      if (result.canceled || !selectedPath) return { canceled: true }

      return {
        canceled: false,
        path: selectedPath,
        name: basename(selectedPath)
      }
    },

    normalizeProjectPath(path) {
      return normalizeExistingProjectPath(path)
    }
  }
}

export function normalizeExistingProjectPath(path: string): string {
  const trimmedPath = path.trim()
  if (!trimmedPath) throw new Error('Project path is required')
  if (!isAbsolute(trimmedPath)) throw new Error('Project path must be absolute')

  const normalized = resolve(trimmedPath)
  if (!existsSync(normalized)) throw new Error('Project path does not exist')
  if (!statSync(normalized).isDirectory()) throw new Error('Project path must be a directory')

  return normalized
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
