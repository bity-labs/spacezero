import { dialog } from 'electron'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join, resolve } from 'node:path'

import { getSpaceZeroProjectsPath } from '../../settings/main'
import type { ProjectPathAdapter } from './projects.service'

export function createProjectPathAdapter({
  getProjectsPath = getSpaceZeroProjectsPath
}: {
  getProjectsPath?: () => Promise<string>
} = {}): ProjectPathAdapter {
  return {
    async createEmptyProjectDirectory(name) {
      const basePath = await getProjectsPath()
      mkdirSync(basePath, { recursive: true })

      const baseSlug = slugify(name) || 'project'
      let candidate = join(basePath, baseSlug)
      let suffix = 2

      while (existsSync(candidate)) {
        candidate = join(basePath, `${baseSlug}-${suffix}`)
        suffix += 1
      }

      mkdirSync(candidate, { recursive: true })
      try {
        initializeEmptyGitRepository(candidate)
        return candidate
      } catch (error) {
        rmSync(candidate, { recursive: true, force: true })
        throw new Error('project.gitInitializationFailed', { cause: error })
      }
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

  try {
    const repositoryRoot = execFileSync('git', ['-C', normalized, 'rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      env: withoutInheritedGitEnvironment(),
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    return repositoryRoot ? resolve(repositoryRoot) : normalized
  } catch {
    return normalized
  }
}

function initializeEmptyGitRepository(path: string): void {
  const isolationDirectory = mkdtempSync(join(tmpdir(), 'spacezero-project-git-'))
  const globalConfigPath = join(isolationDirectory, 'global.gitconfig')
  const templateDirectory = join(isolationDirectory, 'template')
  const hooksDirectory = join(isolationDirectory, 'hooks')
  writeFileSync(globalConfigPath, '', { mode: 0o600, flag: 'wx' })
  mkdirSync(templateDirectory)
  mkdirSync(hooksDirectory)
  const environment = {
    ...withoutInheritedGitEnvironment(),
    GIT_CONFIG_GLOBAL: globalConfigPath,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_ATTR_NOSYSTEM: '1'
  }
  const configArgs = ['-c', `core.hooksPath=${hooksDirectory}`]

  try {
    execFileSync(
      'git',
      [
        ...configArgs,
        'init',
        '--quiet',
        '--initial-branch=main',
        `--template=${templateDirectory}`,
        '--',
        path
      ],
      { stdio: 'ignore', env: environment }
    )
    execFileSync(
      'git',
      [
        ...configArgs,
        '-c',
        'user.name=Space Zero',
        '-c',
        'user.email=spacezero@localhost',
        '-c',
        'commit.gpgSign=false',
        '-C',
        path,
        'commit',
        '--quiet',
        '--allow-empty',
        '--no-verify',
        '-m',
        'Initial commit'
      ],
      { stdio: 'ignore', env: environment }
    )
  } finally {
    rmSync(isolationDirectory, { recursive: true, force: true })
  }
}

function withoutInheritedGitEnvironment(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))
  )
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
