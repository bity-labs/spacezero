import { app } from "electron";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const SUPPORTED_LANGUAGES = ["en", "fr"] as const;
export const LANGUAGE_PREFERENCES = ["system", ...SUPPORTED_LANGUAGES] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];

export type LanguageSettings = {
  readonly preference: LanguagePreference;
  readonly resolvedLanguage: SupportedLanguage;
  readonly systemLanguage: string;
};

export type DesktopSettings = {
  readonly languagePreference: LanguagePreference;
};

const DEFAULT_SETTINGS: DesktopSettings = {
  languagePreference: "system",
};

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return typeof value === "string" && LANGUAGE_PREFERENCES.includes(value as LanguagePreference);
}

export function resolveLanguage(preference: LanguagePreference, systemLanguage: string): SupportedLanguage {
  if (preference !== "system") return preference;

  const baseLanguage = systemLanguage.split("-")[0]?.toLowerCase();
  if (typeof baseLanguage === "string" && SUPPORTED_LANGUAGES.includes(baseLanguage as SupportedLanguage)) {
    return baseLanguage as SupportedLanguage;
  }

  return "en";
}

export function resolveLanguageSettings(preference: LanguagePreference, systemLanguage: string): LanguageSettings {
  return {
    preference,
    resolvedLanguage: resolveLanguage(preference, systemLanguage),
    systemLanguage,
  };
}

export class DesktopSettingsStore {
  constructor(private readonly settingsPath = join(app.getPath("userData"), "settings.json")) {}

  async getSettings(): Promise<DesktopSettings> {
    return readSettingsFile(this.settingsPath);
  }

  async getLanguageSettings(): Promise<LanguageSettings> {
    const settings = await this.getSettings();
    return resolveLanguageSettings(settings.languagePreference, getSystemLanguage());
  }

  async updateLanguagePreference(preference: LanguagePreference): Promise<LanguageSettings> {
    const settings = await this.getSettings();
    await writeSettingsFile(this.settingsPath, { ...settings, languagePreference: preference });
    return resolveLanguageSettings(preference, getSystemLanguage());
  }
}

async function readSettingsFile(settingsPath: string): Promise<DesktopSettings> {
  try {
    const raw = await readFile(settingsPath, "utf8");
    return parseSettings(JSON.parse(raw));
  } catch (error) {
    if (isNotFoundError(error)) return DEFAULT_SETTINGS;
    throw error;
  }
}

function parseSettings(value: unknown): DesktopSettings {
  if (!value || typeof value !== "object") return DEFAULT_SETTINGS;
  const languagePreference = (value as { readonly languagePreference?: unknown }).languagePreference;
  return {
    languagePreference: isLanguagePreference(languagePreference) ? languagePreference : DEFAULT_SETTINGS.languagePreference,
  };
}

async function writeSettingsFile(settingsPath: string, settings: DesktopSettings): Promise<void> {
  await mkdir(dirname(settingsPath), { recursive: true });
  const temporaryPath = `${settingsPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
  await rename(temporaryPath, settingsPath);
}

function getSystemLanguage(): string {
  const [preferredSystemLanguage] = app.getPreferredSystemLanguages();
  return preferredSystemLanguage || app.getLocale() || "en";
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
