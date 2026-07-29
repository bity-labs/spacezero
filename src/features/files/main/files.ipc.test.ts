import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  createCancelFilesSearchHandler,
  createCreateFilesEntryHandler,
  createObserveFilesHandler,
  createUnobserveFilesHandler,
  createListFilesDirectoryHandler,
  createListFilesTreeHandler,
  createMoveFilesEntryHandler,
  createOpenFilesDocumentHandler,
  createRevealFilesEntryHandler,
  createSaveFilesDocumentHandler,
  createSearchFilesHandler,
  createTrashFilesEntryHandler
} from './files.ipc'
import { openFilesDocument } from './files-document.adapter'

const projectContext = { kind: 'project-session' as const, sessionId: 'session-1' }
const knowledgeBaseContext = { kind: 'knowledge-base', contextKey: 'knowledge-base' } as const

function createSender(id = 1) {
  const events = new EventEmitter()
  let destroyed = false
  const sender = {
    id,
    sent: [] as unknown[],
    isDestroyed: vi.fn(() => destroyed),
    send: vi.fn((_channel: string, payload: unknown) => {
      sender.sent.push(payload)
    }),
    once: vi.fn((event: string, listener: () => void) => events.once(event, listener)),
    removeListener: vi.fn((event: string, listener: () => void) => {
      events.removeListener(event, listener)
      return events
    }),
    destroy: () => {
      destroyed = true
      events.emit('destroyed')
    },
    listenerCount: (event: string) => events.listenerCount(event)
  }
  return sender
}

describe('Files IPC', () => {
  it('validates renderer input before listing a context tree', async () => {
    const listTree = vi.fn(async () => ({
      entries: [{ name: 'README.md', relativePath: 'README.md', kind: 'file' as const }],
      presortedPaths: ['README.md']
    }))
    const handle = createListFilesTreeHandler({ listTree })

    await expect(handle({ context: projectContext })).resolves.toEqual({
      entries: [{ name: 'README.md', relativePath: 'README.md', kind: 'file' }],
      presortedPaths: ['README.md']
    })
    await expect(handle({ context: knowledgeBaseContext })).resolves.toEqual({
      entries: [{ name: 'README.md', relativePath: 'README.md', kind: 'file' }],
      presortedPaths: ['README.md']
    })
    expect(listTree).toHaveBeenNthCalledWith(1, { context: projectContext })
    expect(listTree).toHaveBeenNthCalledWith(2, { context: knowledgeBaseContext })

    await expect(handle({ context: projectContext, rootPath: '/tmp' })).rejects.toThrow()
    expect(listTree).toHaveBeenCalledTimes(2)
  })

  it('validates renderer input before listing a context directory', async () => {
    const listDirectory = vi.fn(async () => [])
    const handle = createListFilesDirectoryHandler({ listDirectory })

    await expect(handle({ context: projectContext, relativePath: 'src' })).resolves.toEqual([])
    await expect(handle({ context: knowledgeBaseContext, relativePath: '' })).resolves.toEqual([])
    expect(listDirectory).toHaveBeenNthCalledWith(1, {
      context: projectContext,
      relativePath: 'src'
    })
    expect(listDirectory).toHaveBeenNthCalledWith(2, {
      context: knowledgeBaseContext,
      relativePath: ''
    })

    await expect(
      handle({ context: projectContext, relativePath: '../outside', rootPath: '/tmp' })
    ).rejects.toThrow()
    expect(listDirectory).toHaveBeenCalledTimes(2)
  })

  it('does not expose absolute adapter paths in IPC-visible document errors', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'spacezero-files-ipc-'))
    try {
      const handle = createOpenFilesDocumentHandler({
        openDocument: ({ relativePath }) => openFilesDocument(rootPath, relativePath)
      })

      await expect(
        handle({ context: projectContext, relativePath: 'missing.txt' })
      ).rejects.toThrow('files.notFound')
      await expect(
        handle({ context: projectContext, relativePath: 'missing.txt' })
      ).rejects.not.toThrow(rootPath)
    } finally {
      await rm(rootPath, { recursive: true, force: true })
    }
  })

  it('validates renderer input before create, move, and Trash operations', async () => {
    const createEntry = vi.fn(async () => undefined)
    const moveEntry = vi.fn(async () => undefined)
    const trashEntry = vi.fn(async () => undefined)

    await expect(
      createCreateFilesEntryHandler({ createEntry })({
        context: projectContext,
        relativePath: 'src/new.ts',
        kind: 'file'
      })
    ).resolves.toBeUndefined()
    await expect(
      createMoveFilesEntryHandler({ moveEntry })({
        context: knowledgeBaseContext,
        sourcePath: 'src/new.ts',
        destinationPath: 'src/main.ts'
      })
    ).resolves.toBeUndefined()
    await expect(
      createTrashFilesEntryHandler({ trashEntry })({
        context: projectContext,
        relativePath: 'src/main.ts'
      })
    ).resolves.toBeUndefined()

    await expect(
      createCreateFilesEntryHandler({ createEntry })({
        context: projectContext,
        relativePath: '.git/config',
        kind: 'file'
      })
    ).rejects.toThrow()
    await expect(
      createMoveFilesEntryHandler({ moveEntry })({
        context: knowledgeBaseContext,
        sourcePath: 'src/new.ts',
        destinationPath: '../main.ts'
      })
    ).rejects.toThrow()
    await expect(
      createTrashFilesEntryHandler({ trashEntry })({
        context: projectContext,
        relativePath: 'link',
        rootPath: '/tmp'
      })
    ).rejects.toThrow()

    expect(createEntry).toHaveBeenCalledTimes(1)
    expect(moveEntry).toHaveBeenCalledTimes(1)
    expect(trashEntry).toHaveBeenCalledTimes(1)
  })

  it('validates renderer input before revealing a context entry', async () => {
    const revealInSystemFileManager = vi.fn(async () => undefined)
    const handle = createRevealFilesEntryHandler({ revealInSystemFileManager })

    await expect(
      handle({ context: projectContext, relativePath: 'assets/image.png' })
    ).resolves.toBeUndefined()
    expect(revealInSystemFileManager).toHaveBeenCalledWith({
      context: projectContext,
      relativePath: 'assets/image.png'
    })

    await expect(
      handle({ context: projectContext, relativePath: '/tmp/image.png' })
    ).rejects.toThrow()
    expect(revealInSystemFileManager).toHaveBeenCalledTimes(1)
  })

  it('validates renderer input before searching context files', async () => {
    const search = vi.fn(async () => [
      { kind: 'filename' as const, relativePath: 'README.md', name: 'README.md' }
    ])
    const handle = createSearchFilesHandler({ search })

    await expect(
      handle({
        context: knowledgeBaseContext,
        query: 'readme',
        includeIgnored: true,
        requestId: 'search-1',
        maxResults: 25
      })
    ).resolves.toEqual([{ kind: 'filename', relativePath: 'README.md', name: 'README.md' }])
    expect(search).toHaveBeenCalledWith({
      context: knowledgeBaseContext,
      query: 'readme',
      includeIgnored: true,
      requestId: 'search-1',
      maxResults: 25
    })

    await expect(
      handle({
        context: knowledgeBaseContext,
        query: '',
        includeIgnored: false,
        requestId: 'search-1',
        rootPath: '/tmp'
      })
    ).rejects.toThrow()
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('validates renderer input before canceling a context search', async () => {
    const cancelSearch = vi.fn(async () => undefined)
    const handle = createCancelFilesSearchHandler({ cancelSearch })

    await expect(
      handle({ context: projectContext, requestId: 'search-1' })
    ).resolves.toBeUndefined()
    expect(cancelSearch).toHaveBeenCalledWith({ context: projectContext, requestId: 'search-1' })

    await expect(
      handle({ context: projectContext, requestId: '', rootPath: '/tmp' })
    ).rejects.toThrow()
    expect(cancelSearch).toHaveBeenCalledTimes(1)
  })

  it('closes a watcher exactly once when unobserve races deferred startup', async () => {
    let emitEvent:
      ((event: { kind: 'modified'; contextKey: string; relativePath: string }) => void) | undefined
    let resolveObserve: ((close: () => void) => void) | undefined
    const close = vi.fn()
    const service = {
      observe: vi.fn((_context, onEvent) => {
        emitEvent = onEvent
        return new Promise<() => void>((resolve) => {
          resolveObserve = resolve
        })
      })
    }
    const sender = createSender()
    const observations = new Map()
    const observe = createObserveFilesHandler(service, observations)
    const unobserve = createUnobserveFilesHandler(observations)

    const observed = observe(sender, { context: projectContext, subscriptionId: 'sub-1' })
    await vi.waitFor(() => expect(sender.listenerCount('destroyed')).toBe(1))
    await unobserve(sender, { subscriptionId: 'sub-1' })
    expect(sender.listenerCount('destroyed')).toBe(0)
    resolveObserve?.(close)
    await expect(observed).resolves.toEqual({ subscriptionId: 'sub-1' })

    expect(close).toHaveBeenCalledTimes(1)
    emitEvent?.({ kind: 'modified', contextKey: 'session-1', relativePath: 'README.md' })
    expect(sender.send).not.toHaveBeenCalled()
  })

  it('removes sender destroyed listeners across repeated subscribe/unsubscribe and destruction', async () => {
    const close = vi.fn()
    const service = { observe: vi.fn(async () => close) }
    const sender = createSender()
    const observations = new Map()
    const observe = createObserveFilesHandler(service, observations)
    const unobserve = createUnobserveFilesHandler(observations)

    await observe(sender, { context: projectContext, subscriptionId: 'sub-1' })
    await unobserve(sender, { subscriptionId: 'sub-1' })
    await observe(sender, { context: projectContext, subscriptionId: 'sub-1' })
    sender.destroy()
    await unobserve(sender, { subscriptionId: 'sub-1' })

    expect(close).toHaveBeenCalledTimes(2)
    expect(sender.listenerCount('destroyed')).toBe(0)
  })

  it('cleans up sender listeners when watcher startup rejects', async () => {
    const service = { observe: vi.fn(async () => Promise.reject(new Error('watch failed'))) }
    const sender = createSender()
    const observations = new Map()
    const observe = createObserveFilesHandler(service, observations)

    await expect(
      observe(sender, { context: knowledgeBaseContext, subscriptionId: 'sub-1' })
    ).rejects.toThrow('watch failed')

    expect(sender.listenerCount('destroyed')).toBe(0)
  })

  it('validates renderer input before opening or saving a context document', async () => {
    const document = {
      name: 'README.md',
      relativePath: 'README.md',
      contentKind: 'text' as const,
      size: 5,
      modifiedAt: new Date(0).toISOString(),
      revision: 'revision-1',
      content: 'hello',
      hasBom: false,
      lineEnding: 'lf' as const
    }
    const openDocument = vi.fn(async () => document)
    const saveDocument = vi.fn(async () => ({ status: 'saved' as const, document }))

    await expect(
      createOpenFilesDocumentHandler({ openDocument })({
        context: knowledgeBaseContext,
        relativePath: 'README.md'
      })
    ).resolves.toEqual(document)
    await expect(
      createSaveFilesDocumentHandler({ saveDocument })({
        context: knowledgeBaseContext,
        relativePath: 'README.md',
        content: 'hello again',
        expectedRevision: 'revision-1'
      })
    ).resolves.toMatchObject({ status: 'saved' })

    await expect(
      createOpenFilesDocumentHandler({ openDocument })({
        context: knowledgeBaseContext,
        relativePath: '.git/config',
        rootPath: '/tmp'
      })
    ).rejects.toThrow()
    await expect(
      createSaveFilesDocumentHandler({ saveDocument })({
        context: knowledgeBaseContext,
        relativePath: 'README.md',
        content: 'hello',
        expectedRevision: ''
      })
    ).rejects.toThrow()
    expect(openDocument).toHaveBeenCalledTimes(1)
    expect(saveDocument).toHaveBeenCalledTimes(1)
  })
})
