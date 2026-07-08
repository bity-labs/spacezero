type SettingsRowProps = {
  title: string
  description: string
  children: React.ReactNode
}

function SettingsRow({ title, description, children }: SettingsRowProps): React.JSX.Element {
  return (
    <div className="flex min-h-18 items-center gap-4 border-b border-border/70 px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export { SettingsRow }
