import { execFile } from 'node:child_process'
import { access, lstat, mkdir, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { KnowledgeBaseHost } from './knowledge-base.service'

export function createKnowledgeBaseHost(): KnowledgeBaseHost {
  return {
    async pathExists(path) {
      try {
        await access(path)
        return true
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          return false
        }
        throw error
      }
    },

    async resolveDirectory(path) {
      const details = await lstat(path)
      if (!details.isDirectory() || details.isSymbolicLink()) {
        throw new Error('Knowledge Base root must be a real directory.')
      }
      return realpath(path)
    },

    async createDirectory(path) {
      await mkdir(dirname(path), { recursive: true })
      await mkdir(path)
    },

    async ensureParentDirectory(path) {
      await mkdir(dirname(path), { recursive: true })
    },

    async removeDirectory(path) {
      await rm(path, { recursive: true, force: true })
    },

    async writeTextFile(path, content) {
      await writeFile(path, content, 'utf8')
    },

    runGit(cwd, args) {
      return new Promise((resolve, reject) => {
        execFile(
          'git',
          [...args],
          { cwd, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
          (error, stdout, stderr) => {
            if (error) {
              reject(new Error(stderr.trim() || error.message))
              return
            }
            resolve({ stdout, stderr })
          }
        )
      })
    }
  }
}
