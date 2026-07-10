import { app, dialog } from 'electron'
import { existsSync, mkdirSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

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
      const normalized = resolve(path.trim())
      if (!normalized) throw new Error('Project path is required')
      return normalized
    }
  }
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
