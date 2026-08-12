import { Heading, Text } from '@renderer/components/ui/typography'

type SettingsPageHeaderProps = {
  title: string
  description?: string
}

function SettingsPageHeader({ title, description }: SettingsPageHeaderProps): React.JSX.Element {
  return (
    <header className="mb-6 space-y-1">
      <Heading as="h2" level="h2">
        {title}
      </Heading>
      {description ? <Text variant="muted">{description}</Text> : null}
    </header>
  )
}

export { SettingsPageHeader }
