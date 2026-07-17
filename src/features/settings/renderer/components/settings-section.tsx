import { Card } from '@renderer/components/ui/card'

type SettingsSectionProps = {
  title: string
  description?: string
  footer?: React.ReactNode
  children: React.ReactNode
}

function SettingsSection({
  title,
  description,
  footer,
  children
}: SettingsSectionProps): React.JSX.Element {
  return (
    <section className="space-y-3">
      <div className="px-2">
        <h3 className="text-sm text-muted-foreground">{title}</h3>
        {description ? (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <Card className="gap-0 py-0">{children}</Card>
      {footer ? <footer className="px-2">{footer}</footer> : null}
    </section>
  )
}

export { SettingsSection }
