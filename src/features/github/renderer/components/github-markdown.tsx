import { Streamdown } from 'streamdown'

export function GitHubMarkdown({ markdown }: { markdown: string | null }): React.JSX.Element {
  if (!markdown?.trim()) {
    return <p className="text-sm text-muted-foreground">No description provided.</p>
  }

  return (
    <div className="prose prose-sm max-w-none text-sm dark:prose-invert">
      <Streamdown>{markdown}</Streamdown>
    </div>
  )
}
