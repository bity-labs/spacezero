import {
  File,
  FileArchive,
  FileC,
  FileCode,
  FileCpp,
  FileCSharp,
  FileCss,
  FileCsv,
  FileHtml,
  FileImage,
  FileIni,
  FileJs,
  FileJsx,
  FileMd,
  FilePdf,
  FilePy,
  FileRs,
  FileSql,
  FileSvg,
  FileTs,
  FileTsx,
  FileTxt,
  FileVue
} from '@phosphor-icons/react'
import type { ComponentType, SVGProps } from 'react'

type FileIcon = ComponentType<SVGProps<SVGSVGElement>>

type FileIconDefinition = {
  icon: FileIcon
  type: string
}

const iconByExtension: Record<string, FileIconDefinition> = {
  c: { icon: FileC, type: 'c' },
  cc: { icon: FileCpp, type: 'cpp' },
  cpp: { icon: FileCpp, type: 'cpp' },
  cs: { icon: FileCSharp, type: 'csharp' },
  css: { icon: FileCss, type: 'css' },
  csv: { icon: FileCsv, type: 'csv' },
  gif: { icon: FileImage, type: 'image' },
  h: { icon: FileC, type: 'c' },
  hpp: { icon: FileCpp, type: 'cpp' },
  htm: { icon: FileHtml, type: 'html' },
  html: { icon: FileHtml, type: 'html' },
  ini: { icon: FileIni, type: 'ini' },
  jpeg: { icon: FileImage, type: 'image' },
  jpg: { icon: FileImage, type: 'image' },
  js: { icon: FileJs, type: 'js' },
  jsx: { icon: FileJsx, type: 'jsx' },
  json: { icon: FileCode, type: 'json' },
  md: { icon: FileMd, type: 'md' },
  mdx: { icon: FileMd, type: 'md' },
  pdf: { icon: FilePdf, type: 'pdf' },
  png: { icon: FileImage, type: 'image' },
  py: { icon: FilePy, type: 'py' },
  rs: { icon: FileRs, type: 'rs' },
  sql: { icon: FileSql, type: 'sql' },
  svg: { icon: FileSvg, type: 'svg' },
  toml: { icon: FileIni, type: 'ini' },
  ts: { icon: FileTs, type: 'ts' },
  tsx: { icon: FileTsx, type: 'tsx' },
  txt: { icon: FileTxt, type: 'txt' },
  vue: { icon: FileVue, type: 'vue' },
  webp: { icon: FileImage, type: 'image' },
  yaml: { icon: FileCode, type: 'yaml' },
  yml: { icon: FileCode, type: 'yaml' },
  zip: { icon: FileArchive, type: 'archive' }
}

export function FilesTabIcon({ fileName }: { fileName: string }): React.JSX.Element {
  const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() ?? '' : ''
  const definition = iconByExtension[extension] ?? { icon: File, type: 'file' }
  const Icon = definition.icon
  return (
    <Icon
      aria-hidden="true"
      className="size-4 shrink-0"
      data-file-type={definition.type}
    />
  )
}
