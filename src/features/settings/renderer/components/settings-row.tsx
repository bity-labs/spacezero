type SettingsRowProps = {
  title: string
  description: string
  children: React.ReactNode
}

function SettingsRow({ title, description, children }: SettingsRowProps): React.JSX.Element {
  return (
    <div className="flex min-h-[72px] items-center gap-4 border-b border-border/70 px-4 py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-5 text-foreground">{title}</p>
        <p className="mt-1 text-xs leading-4 text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0 self-center">{children}</div>
    </div>
  )
}

export { SettingsRow }
