const LANGUAGE_BY_FILENAME = new Map<string, string>([
  ['dockerfile', 'dockerfile'],
  ['makefile', 'makefile'],
  ['package.json', 'json'],
  ['tsconfig.json', 'json']
])

const LANGUAGE_BY_EXTENSION = new Map<string, string>([
  ['css', 'css'],
  ['html', 'html'],
  ['js', 'javascript'],
  ['jsx', 'javascript'],
  ['json', 'json'],
  ['md', 'markdown'],
  ['mdx', 'markdown'],
  ['mjs', 'javascript'],
  ['ts', 'typescript'],
  ['tsx', 'typescript'],
  ['xml', 'xml'],
  ['yaml', 'yaml'],
  ['yml', 'yaml']
])

export function getFilesEditorLanguage(relativePath: string): string {
  const name = relativePath.split('/').at(-1) ?? relativePath
  const lowerName = name.toLowerCase()
  const filenameLanguage = LANGUAGE_BY_FILENAME.get(lowerName)
  if (filenameLanguage) return filenameLanguage
  const extension = lowerName.includes('.') ? lowerName.split('.').at(-1) : undefined
  return (extension && LANGUAGE_BY_EXTENSION.get(extension)) || 'plaintext'
}

export function createFilesMonacoModelPath(sessionId: string, relativePath: string): string {
  const encodedSession = encodeURIComponent(sessionId)
  const encodedPath = relativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `spacezero-files://${encodedSession}/${encodedPath}`
}
