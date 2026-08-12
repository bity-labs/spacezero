import { Card } from '@renderer/components/ui/card'
import { Text } from '@renderer/components/ui/typography'

type SettingsSectionProps = {
  title?: string
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
      {title || description ? (
        <div>
          {title ? (
            <h3>
              <Text as="span" variant="muted">
                {title}
              </Text>
            </h3>
          ) : null}
          {description ? (
            <Text variant="subtle" className={title ? 'mt-1' : undefined}>
              {description}
            </Text>
          ) : null}
        </div>
      ) : null}
      <Card className="gap-0 py-0">{children}</Card>
      {footer ? <footer>{footer}</footer> : null}
    </section>
  )
}

export { SettingsSection }
