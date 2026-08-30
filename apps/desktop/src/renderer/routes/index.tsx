import { createFileRoute } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/")({
  component: IndexRoute,
});

function IndexRoute(): ReactElement {
  const { t } = useTranslation();

  return (
    <section className="flex min-h-0 flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("app.welcome")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{t("app.welcomeDescription")}</p>
      </div>
    </section>
  );
}
