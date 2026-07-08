import { Card } from '@renderer/components/ui/card'

type SettingsSectionProps = {
  title: string
  children: React.ReactNode
}

function SettingsSection({ title, children }: SettingsSectionProps): React.JSX.Element {
  return (
    <section className="space-y-3">
      <h3 className="px-2 text-sm text-muted-foreground">{title}</h3>
      <Card className="gap-0 py-0">{children}</Card>
    </section>
  )
}

export { SettingsSection }
