export function createFilesDocumentCacheKey(
  contextKey: string,
  canonicalRelativePath: string,
  baselineKey: string
): string {
  const encodedContext = encodeURIComponent(contextKey)
  const encodedPath = canonicalRelativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `spacezero-files:${encodedContext}:document:${encodedPath}:${encodeURIComponent(baselineKey)}`
}
