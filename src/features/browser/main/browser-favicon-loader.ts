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
) => Promise<Pick<Response, 'arrayBuffer' | 'headers' | 'ok'>>

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

    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_FAVICON_BYTES) return null
    return `data:${contentType};base64,${bytes.toString('base64')}`
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
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
