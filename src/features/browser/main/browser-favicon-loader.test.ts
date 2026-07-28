import { describe, expect, it, vi } from 'vitest'

import { createBrowserFaviconLoader, type BrowserFaviconFetch } from './browser-favicon-loader'

function makeResponse(body: string, contentType: string, ok = true): Pick<Response, 'body' | 'headers' | 'ok'> {
  return new Response(body, {
    headers: { 'content-type': contentType },
    status: ok ? 200 : 404
  })
}

describe('createBrowserFaviconLoader', () => {
  it('loads remote HTTP favicons as data URLs without forwarding credentials', async () => {
    const fetchFavicon = vi.fn<BrowserFaviconFetch>(async () => makeResponse('icon', 'image/png'))
    const loader = createBrowserFaviconLoader(fetchFavicon)

    await expect(loader.load(['https://example.com/favicon.png'])).resolves.toBe(
      'data:image/png;base64,aWNvbg=='
    )

    expect(fetchFavicon).toHaveBeenCalledWith(
      'https://example.com/favicon.png',
      expect.objectContaining({ credentials: 'omit', redirect: 'follow' })
    )
  })

  it('tries later favicon candidates when the first cannot be loaded', async () => {
    const fetchFavicon = vi
      .fn<BrowserFaviconFetch>()
      .mockResolvedValueOnce(makeResponse('not found', 'text/plain', false))
      .mockResolvedValueOnce(makeResponse('icon', 'image/x-icon'))
    const loader = createBrowserFaviconLoader(fetchFavicon)

    await expect(
      loader.load(['https://example.com/missing.ico', 'https://example.com/favicon.ico'])
    ).resolves.toBe('data:image/x-icon;base64,aWNvbg==')
  })

  it('rejects unsupported protocols and unsafe image types', async () => {
    const fetchFavicon = vi.fn<BrowserFaviconFetch>(async () => makeResponse('<svg />', 'image/svg+xml'))
    const loader = createBrowserFaviconLoader(fetchFavicon)

    await expect(
      loader.load(['file:///tmp/favicon.png', 'https://example.com/favicon.svg'])
    ).resolves.toBeNull()
  })

  it('cancels streamed favicon responses when they exceed the byte ceiling', async () => {
    let cancelCalled = false
    const chunk: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(64 * 1024))
    const overflowChunk: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(1))
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.enqueue(chunk)
        controller.enqueue(chunk)
        controller.enqueue(overflowChunk)
      },
      cancel() {
        cancelCalled = true
      }
    })
    const fetchFavicon = vi.fn<BrowserFaviconFetch>(async () => ({
      ok: true,
      headers: new Headers({ 'content-type': 'image/png' }),
      body
    }))
    const loader = createBrowserFaviconLoader(fetchFavicon)

    await expect(loader.load(['https://example.com/oversized.png'])).resolves.toBeNull()

    expect(cancelCalled).toBe(true)
    expect(fetchFavicon.mock.calls[0]?.[1].signal).toMatchObject({ aborted: true })
  })

  it('passes through supported data image favicons without network access', async () => {
    const fetchFavicon = vi.fn<BrowserFaviconFetch>()
    const loader = createBrowserFaviconLoader(fetchFavicon)

    await expect(loader.load(['data:image/png;base64,aWNvbg=='])).resolves.toBe(
      'data:image/png;base64,aWNvbg=='
    )

    expect(fetchFavicon).not.toHaveBeenCalled()
  })
})
