import { Text } from '@renderer/components/ui/typography'

type SettingsRowProps = {
  title: string
  description: string
  children: React.ReactNode
}

function SettingsRow({ title, description, children }: SettingsRowProps): React.JSX.Element {
  return (
    <div className="flex min-h-[72px] items-center gap-4 border-b border-border/70 px-4 py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <Text variant="label" className="leading-5">
          {title}
        </Text>
        <Text variant="subtle" className="mt-1 leading-4">
          {description}
        </Text>
      </div>
      <div className="shrink-0 self-center">{children}</div>
    </div>
  )
}

export { SettingsRow }
