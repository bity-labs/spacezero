import { app } from "electron";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const SUPPORTED_LANGUAGES = ["en", "fr"] as const;
export const LANGUAGE_PREFERENCES = ["system", ...SUPPORTED_LANGUAGES] as const;
export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export const FONT_FAMILY_PREFERENCES = [
  "system",
  "geist",
  "sf-pro",
  "inter",
  "helvetica",
  "arial",
  "sf-mono",
  "menlo",
  "monaco",
  "jetbrains-mono",
  "monospace",
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];
export type LanguagePreference = (typeof LANGUAGE_PREFERENCES)[number];
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
export type FontFamilyPreference = (typeof FONT_FAMILY_PREFERENCES)[number];

export type LanguageSettings = {
  readonly preference: LanguagePreference;
  readonly resolvedLanguage: SupportedLanguage;
  readonly systemLanguage: string;
};

export type AppearanceSettings = {
  readonly themePreference: ThemePreference;
  readonly fontFamily: FontFamilyPreference;
  readonly thinFontAntialiasing: boolean;
};

export type DesktopSettings = {
  readonly languagePreference: LanguagePreference;
  readonly themePreference: ThemePreference;
  readonly fontFamily: FontFamilyPreference;
  readonly thinFontAntialiasing: boolean;
};

const DEFAULT_SETTINGS: DesktopSettings = {
  languagePreference: "system",
  themePreference: "system",
  fontFamily: "system",
  thinFontAntialiasing: true,
};

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return typeof value === "string" && LANGUAGE_PREFERENCES.includes(value as LanguagePreference);
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && THEME_PREFERENCES.includes(value as ThemePreference);
}

export function isFontFamilyPreference(value: unknown): value is FontFamilyPreference {
  return typeof value === "string" && FONT_FAMILY_PREFERENCES.includes(value as FontFamilyPreference);
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

  async getAppearanceSettings(): Promise<AppearanceSettings> {
    const settings = await this.getSettings();
    return toAppearanceSettings(settings);
  }

  async updateAppearanceSettings(appearanceSettings: AppearanceSettings): Promise<AppearanceSettings> {
    const settings = await this.getSettings();
    const nextSettings = { ...settings, ...appearanceSettings };
    await writeSettingsFile(this.settingsPath, nextSettings);
    return toAppearanceSettings(nextSettings);
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
  const settings = value as {
    readonly languagePreference?: unknown;
    readonly themePreference?: unknown;
    readonly fontFamily?: unknown;
    readonly thinFontAntialiasing?: unknown;
  };
  return {
    languagePreference: isLanguagePreference(settings.languagePreference)
      ? settings.languagePreference
      : DEFAULT_SETTINGS.languagePreference,
    themePreference: isThemePreference(settings.themePreference) ? settings.themePreference : DEFAULT_SETTINGS.themePreference,
    fontFamily: isFontFamilyPreference(settings.fontFamily) ? settings.fontFamily : DEFAULT_SETTINGS.fontFamily,
    thinFontAntialiasing:
      typeof settings.thinFontAntialiasing === "boolean"
        ? settings.thinFontAntialiasing
        : DEFAULT_SETTINGS.thinFontAntialiasing,
  };
}

function toAppearanceSettings(settings: DesktopSettings): AppearanceSettings {
  return {
    themePreference: settings.themePreference,
    fontFamily: settings.fontFamily,
    thinFontAntialiasing: settings.thinFontAntialiasing,
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
