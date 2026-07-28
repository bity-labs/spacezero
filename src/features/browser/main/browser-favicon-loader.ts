import type { BrowserFaviconLoader } from './browser.service'

const MAX_FAVICON_BYTES = 128 * 1024
const FAVICON_FETCH_TIMEOUT_MS = 5_000

const SUPPORTED_FAVICON_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/x-icon',
  'image/vnd.microsoft.icon'
])

export type BrowserFaviconFetch = (
  url: string,
  init: RequestInit
) => Promise<Pick<Response, 'body' | 'headers' | 'ok'>>

export function createBrowserFaviconLoader(fetchFavicon: BrowserFaviconFetch = fetch): BrowserFaviconLoader {
  return {
    async load(faviconUrls) {
      for (const faviconUrl of faviconUrls) {
        const dataUrl = await loadOneFavicon(faviconUrl, fetchFavicon)
        if (dataUrl) return dataUrl
      }
      return null
    }
  }
}

async function loadOneFavicon(
  faviconUrl: string,
  fetchFavicon: BrowserFaviconFetch
): Promise<string | null> {
  const parsedUrl = parseSupportedFaviconUrl(faviconUrl)
  if (!parsedUrl) return null
  if (parsedUrl.protocol === 'data:') return supportedDataUrl(faviconUrl)

  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), FAVICON_FETCH_TIMEOUT_MS)
  try {
    const response = await fetchFavicon(parsedUrl.toString(), {
      headers: {
        Accept: 'image/png,image/jpeg,image/gif,image/webp,image/x-icon,image/vnd.microsoft.icon;q=0.9,*/*;q=0.5'
      },
      redirect: 'follow',
      credentials: 'omit',
      signal: abortController.signal
    })
    if (!response.ok) return null

    const contentType = normalizeContentType(response.headers.get('content-type'))
    if (!contentType || !SUPPORTED_FAVICON_MIME_TYPES.has(contentType)) return null

    const bytes = await readBoundedResponseBytes(response, abortController)
    if (!bytes || bytes.byteLength === 0) return null
    return `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function readBoundedResponseBytes(
  response: Pick<Response, 'body'>,
  abortController: AbortController
): Promise<Uint8Array | null> {
  const reader = response.body?.getReader()
  if (!reader) return null

  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      totalBytes += value.byteLength
      if (totalBytes > MAX_FAVICON_BYTES) {
        abortController.abort()
        await reader.cancel()
        return null
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

function parseSupportedFaviconUrl(faviconUrl: string): URL | null {
  try {
    const parsedUrl = new URL(faviconUrl)
    return parsedUrl.protocol === 'https:' || parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'data:'
      ? parsedUrl
      : null
  } catch {
    return null
  }
}

function supportedDataUrl(faviconUrl: string): string | null {
  const match = /^data:([^;,]+)[;,]/i.exec(faviconUrl)
  if (!match) return null
  const contentType = normalizeContentType(match[1])
  if (!contentType || !SUPPORTED_FAVICON_MIME_TYPES.has(contentType)) return null
  return faviconUrl.length <= MAX_FAVICON_BYTES * 2 ? faviconUrl : null
}

function normalizeContentType(contentType: string | null): string | null {
  return contentType?.split(';')[0]?.trim().toLowerCase() || null
}
