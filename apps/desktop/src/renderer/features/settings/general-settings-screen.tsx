import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@spacezero/ui/components/select";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { i18n, type LanguagePreference } from "../../i18n";
import { SettingsPageHeader } from "./components/settings-page-header";
import { SettingsRow } from "./components/settings-row";
import { SettingsSection } from "./components/settings-section";

export function GeneralSettingsScreen(): ReactElement {
  const { t } = useTranslation();
  const [languagePreference, setCurrentLanguagePreference] = useState<LanguagePreference>("system");
  const [languageError, setLanguageError] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    window.spacezero.settings.getLanguageSettings().then(
      (settings) => {
        if (!isCurrent) return;
        setCurrentLanguagePreference(settings.preference);
      },
      () => {
        if (!isCurrent) return;
        setLanguageError(true);
      },
    );
    return () => {
      isCurrent = false;
    };
  }, []);

  const changeLanguagePreference = async (preference: LanguagePreference): Promise<void> => {
    setLanguageError(false);
    setCurrentLanguagePreference(preference);
    try {
      const settings = await window.spacezero.settings.updateLanguagePreference(preference);
      setCurrentLanguagePreference(settings.preference);
      await i18n.changeLanguage(settings.resolvedLanguage);
    } catch {
      setLanguageError(true);
    }
  };

  return (
    <>
      <SettingsPageHeader title={t("settings.general.title")} />
      <div className="flex flex-col gap-8">
        <SettingsSection error={languageError ? t("settings.general.languageUpdateError") : null}>
          <SettingsRow title={t("settings.general.language")} description={t("settings.general.languageDescription")}>
            <Select
              value={languagePreference}
              onValueChange={(value) => void changeLanguagePreference(value as LanguagePreference)}
            >
              <SelectTrigger size="sm" className="w-48" aria-label={t("settings.general.language")}>
                <SelectValue>{(value: LanguagePreference) => getLanguagePreferenceLabel(value, t)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="system">{t("settings.general.languageOptions.system")}</SelectItem>
                  <SelectItem value="en">{t("settings.general.languageOptions.en")}</SelectItem>
                  <SelectItem value="fr">{t("settings.general.languageOptions.fr")}</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </SettingsRow>
        </SettingsSection>
      </div>
    </>
  );
}

function getLanguagePreferenceLabel(
  preference: LanguagePreference,
  t: (key: string) => string,
): string {
  if (preference === "fr") return t("settings.general.languageOptions.fr");
  if (preference === "en") return t("settings.general.languageOptions.en");
  return t("settings.general.languageOptions.system");
}
