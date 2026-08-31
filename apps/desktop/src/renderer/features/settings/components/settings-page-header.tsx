import { Heading, Text } from "@spacezero/ui/components/typography";
import type { ReactElement } from "react";

type SettingsPageHeaderProps = {
  title: string;
  description?: string;
};

function SettingsPageHeader({ title, description }: SettingsPageHeaderProps): ReactElement {
  return (
    <header className="mb-6 flex flex-col gap-1">
      <Heading as="h2" level="h2">
        {title}
      </Heading>
      {description ? <Text variant="muted">{description}</Text> : null}
    </header>
  );
}

export { SettingsPageHeader };
