import { LinkSimple } from '@phosphor-icons/react'

import type { FilesEntryKind } from '../../shared'
import { resolveFilesIconName } from '../lib/files-icon-resolver'

const iconModules = import.meta.glob<string>(
  '../../../../../node_modules/material-icon-theme/icons/*.svg',
  { eager: true, import: 'default', query: '?url' }
)
const iconUrls = new Map(
  Object.entries(iconModules).map(([path, url]) => [
    path
      .split('/')
      .at(-1)
      ?.replace(/\.svg$/, ''),
    url
  ])
)

export function FilesIcon({
  name,
  kind,
  expanded
}: {
  name: string
  kind: FilesEntryKind
  expanded: boolean
}): React.JSX.Element {
  const iconName = resolveFilesIconName({ name, kind, expanded })
  const iconUrl = iconUrls.get(iconName) ?? iconUrls.get(kind === 'directory' ? 'folder' : 'file')

  return (
    <span className="relative flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
      {iconUrl ? <img alt="" className="size-4" draggable={false} src={iconUrl} /> : null}
      {kind === 'symlink' ? (
        <LinkSimple className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-background text-foreground" />
      ) : null}
    </span>
  )
}
