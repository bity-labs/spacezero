import { Card } from '@renderer/components/ui/card'
import { Text } from '@renderer/components/ui/typography'

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
        <h3>
          <Text as="span" variant="muted">
            {title}
          </Text>
        </h3>
        {description ? (
          <Text variant="subtle" className="mt-1">
            {description}
          </Text>
        ) : null}
      </div>
      <Card className="gap-0 py-0">{children}</Card>
      {footer ? <footer className="px-2">{footer}</footer> : null}
    </section>
  )
}

export { SettingsSection }
