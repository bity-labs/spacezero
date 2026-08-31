import { Card } from "@spacezero/ui/components/card";
import { Text } from "@spacezero/ui/components/typography";
import type { ReactElement, ReactNode } from "react";

type SettingsSectionProps = {
  title?: string;
  description?: string;
  error?: string | null;
  children: ReactNode;
};

function SettingsSection({ title, description, error, children }: SettingsSectionProps): ReactElement {
  return (
    <section className="flex flex-col gap-3">
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
            <Text variant="subtle" className={title ? "mt-1" : undefined}>
              {description}
            </Text>
          ) : null}
        </div>
      ) : null}
      <Card className="gap-0 py-0">{children}</Card>
      {error ? (
        <Text variant="danger" role="alert">
          {error}
        </Text>
      ) : null}
    </section>
  );
}

export { SettingsSection };
