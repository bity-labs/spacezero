import { app, dialog } from 'electron'
import { eq } from 'drizzle-orm'
import { mkdir } from 'node:fs/promises'
import { isAbsolute, join, resolve } from 'node:path'

import { getDatabase } from '../../../main/db'
import * as schema from '../../../main/db/schema'
import type { StorageSettings } from '../../../shared/storage-settings'

const SPACE_ZERO_HOME_KEY = 'storage.spaceZeroHome'

export async function getStorageSettings(): Promise<StorageSettings> {
  const configuredHome = await readSpaceZeroHome()
  return createStorageSettings(configuredHome ?? getDefaultSpaceZeroHome(app.getPath('home')))
}

export async function chooseSpaceZeroHome(): Promise<StorageSettings | null> {
  const current = await getStorageSettings()
  const result = await dialog.showOpenDialog({
    defaultPath: current.spaceZeroHome,
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose Space Zero Home'
  })

  const [selectedPath] = result.filePaths
  if (result.canceled || !selectedPath) return null

  const spaceZeroHome = normalizeSpaceZeroHome(selectedPath)
  await mkdir(join(spaceZeroHome, 'projects'), { recursive: true })
  await mkdir(join(spaceZeroHome, 'skills'), { recursive: true })
  await mkdir(join(spaceZeroHome, 'worktrees'), { recursive: true })
  await writeSpaceZeroHome(spaceZeroHome)

  return createStorageSettings(spaceZeroHome)
}

export async function getSpaceZeroWorktreesPath(): Promise<string> {
  const settings = await getStorageSettings()
  await mkdir(settings.worktreesPath, { recursive: true })
  return settings.worktreesPath
}

export async function getSpaceZeroProjectsPath(): Promise<string> {
  const settings = await getStorageSettings()
  await mkdir(settings.projectsPath, { recursive: true })
  await mkdir(join(settings.spaceZeroHome, 'skills'), { recursive: true })
  return settings.projectsPath
}

export function getDefaultSpaceZeroHome(homePath: string): string {
  return join(homePath, 'SpaceZero')
}

export function createStorageSettings(spaceZeroHome: string): StorageSettings {
  const normalizedHome = normalizeSpaceZeroHome(spaceZeroHome)
  return {
    spaceZeroHome: normalizedHome,
    projectsPath: join(normalizedHome, 'projects'),
    worktreesPath: join(normalizedHome, 'worktrees')
  }
}

export function normalizeSpaceZeroHome(path: string): string {
  const trimmedPath = path.trim()
  if (!trimmedPath) throw new Error('settings.storageHomeRequired')
  if (!isAbsolute(trimmedPath)) throw new Error('settings.storageHomeMustBeAbsolute')
  return resolve(trimmedPath)
}

async function readSpaceZeroHome(): Promise<string | undefined> {
  const db = getDatabase()
  const [storedSetting] = await db
    .select({ value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(eq(schema.appSettings.key, SPACE_ZERO_HOME_KEY))
    .limit(1)

  if (!storedSetting) return undefined

  try {
    return normalizeSpaceZeroHome(storedSetting.value)
  } catch {
    return undefined
  }
}

async function writeSpaceZeroHome(spaceZeroHome: string): Promise<void> {
  const db = getDatabase()
  const now = new Date()

  await db
    .insert(schema.appSettings)
    .values({ key: SPACE_ZERO_HOME_KEY, value: spaceZeroHome, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.appSettings.key,
      set: { value: spaceZeroHome, updatedAt: now }
    })
}
