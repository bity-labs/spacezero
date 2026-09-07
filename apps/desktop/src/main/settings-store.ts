import { app } from "electron";
import { randomUUID } from "node:crypto";
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

/**
 * Renderer-owned UI route state persisted beside Desktop preferences. It holds
 * only a Global Chat Session id or null: never credentials, capabilities,
 * Pi state, transcripts, or other secrets.
 */
const DEFAULT_LAST_ACTIVE_GLOBAL_CHAT_SESSION_ID: string | null = null;

export const MAX_LAST_ACTIVE_GLOBAL_CHAT_SESSION_ID_LENGTH = 200;

export function isLastActiveGlobalChatSessionId(
  value: unknown,
): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value.length > 0 &&
      value.length <= MAX_LAST_ACTIVE_GLOBAL_CHAT_SESSION_ID_LENGTH)
  );
}

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
    return (await readSettingsFile(this.settingsPath)).settings;
  }

  async getLastActiveGlobalChatSessionId(): Promise<string | null> {
    return (await readSettingsFile(this.settingsPath))
      .lastActiveGlobalChatSessionId;
  }

  async setLastActiveGlobalChatSessionId(
    sessionId: string | null,
  ): Promise<void> {
    if (!isLastActiveGlobalChatSessionId(sessionId))
      throw new Error("invalid last active Global Chat Session id");
    const persisted = await readSettingsFile(this.settingsPath);
    await writeSettingsFile(this.settingsPath, {
      ...persisted,
      lastActiveGlobalChatSessionId: sessionId,
    });
  }

  async getLanguageSettings(): Promise<LanguageSettings> {
    const settings = await this.getSettings();
    return resolveLanguageSettings(settings.languagePreference, getSystemLanguage());
  }

  async updateLanguagePreference(preference: LanguagePreference): Promise<LanguageSettings> {
    const persisted = await readSettingsFile(this.settingsPath);
    await writeSettingsFile(this.settingsPath, {
      ...persisted,
      settings: { ...persisted.settings, languagePreference: preference },
    });
    return resolveLanguageSettings(preference, getSystemLanguage());
  }

  async getAppearanceSettings(): Promise<AppearanceSettings> {
    const settings = await this.getSettings();
    return toAppearanceSettings(settings);
  }

  async updateAppearanceSettings(appearanceSettings: AppearanceSettings): Promise<AppearanceSettings> {
    const persisted = await readSettingsFile(this.settingsPath);
    const nextSettings: DesktopSettings = { ...persisted.settings, ...appearanceSettings };
    await writeSettingsFile(this.settingsPath, {
      ...persisted,
      settings: nextSettings,
    });
    return toAppearanceSettings(nextSettings);
  }
}

interface PersistedSettings {
  readonly settings: DesktopSettings;
  readonly lastActiveGlobalChatSessionId: string | null;
}

async function readSettingsFile(settingsPath: string): Promise<PersistedSettings> {
  try {
    const raw = await readFile(settingsPath, "utf8");
    return parseSettings(JSON.parse(raw));
  } catch (error) {
    if (isNotFoundError(error))
      return {
        settings: DEFAULT_SETTINGS,
        lastActiveGlobalChatSessionId:
          DEFAULT_LAST_ACTIVE_GLOBAL_CHAT_SESSION_ID,
      };
    throw error;
  }
}

function parseSettings(value: unknown): {
  settings: DesktopSettings;
  lastActiveGlobalChatSessionId: string | null;
} {
  if (!value || typeof value !== "object")
    return {
      settings: DEFAULT_SETTINGS,
      lastActiveGlobalChatSessionId:
        DEFAULT_LAST_ACTIVE_GLOBAL_CHAT_SESSION_ID,
    };
  const raw = value as {
    readonly languagePreference?: unknown;
    readonly themePreference?: unknown;
    readonly fontFamily?: unknown;
    readonly thinFontAntialiasing?: unknown;
    readonly lastActiveGlobalChatSessionId?: unknown;
  };
  return {
    settings: {
      languagePreference: isLanguagePreference(raw.languagePreference)
        ? raw.languagePreference
        : DEFAULT_SETTINGS.languagePreference,
      themePreference: isThemePreference(raw.themePreference) ? raw.themePreference : DEFAULT_SETTINGS.themePreference,
      fontFamily: isFontFamilyPreference(raw.fontFamily) ? raw.fontFamily : DEFAULT_SETTINGS.fontFamily,
      thinFontAntialiasing:
        typeof raw.thinFontAntialiasing === "boolean"
          ? raw.thinFontAntialiasing
          : DEFAULT_SETTINGS.thinFontAntialiasing,
    },
    lastActiveGlobalChatSessionId: isLastActiveGlobalChatSessionId(
      raw.lastActiveGlobalChatSessionId,
    )
      ? raw.lastActiveGlobalChatSessionId
      : DEFAULT_LAST_ACTIVE_GLOBAL_CHAT_SESSION_ID,
  };
}

function toAppearanceSettings(settings: DesktopSettings): AppearanceSettings {
  return {
    themePreference: settings.themePreference,
    fontFamily: settings.fontFamily,
    thinFontAntialiasing: settings.thinFontAntialiasing,
  };
}

function toSettingsFileContent(persisted: PersistedSettings): DesktopSettings & {
  lastActiveGlobalChatSessionId: string | null;
} {
  return {
    ...persisted.settings,
    lastActiveGlobalChatSessionId: persisted.lastActiveGlobalChatSessionId,
  };
}

async function writeSettingsFile(
  settingsPath: string,
  persisted: PersistedSettings,
): Promise<void> {
  return writeSettingsFileContent(settingsPath, toSettingsFileContent(persisted));
}

async function writeSettingsFileContent(
  settingsPath: string,
  content: DesktopSettings & { lastActiveGlobalChatSessionId: string | null },
): Promise<void> {
  await mkdir(dirname(settingsPath), { recursive: true });
  const temporaryPath = `${settingsPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(content, null, 2)}\n`, "utf8");
  await rename(temporaryPath, settingsPath);
}

function getSystemLanguage(): string {
  const [preferredSystemLanguage] = app.getPreferredSystemLanguages();
  return preferredSystemLanguage || app.getLocale() || "en";
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
