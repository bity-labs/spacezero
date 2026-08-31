import type { AppearanceSettings, FontFamilyPreference } from "./appearance-settings-screen";

export type ThemePreference = "system" | "light" | "dark";

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  themePreference: "system",
  fontFamily: "system",
  thinFontAntialiasing: true,
};

export function applyAppearanceSettings(settings: AppearanceSettings): void {
  applyThemePreference(settings.themePreference);
  applyFontFamily(settings.fontFamily);
  document.documentElement.classList.toggle("thin-font-antialiasing", settings.thinFontAntialiasing);
}

export function applyThemePreference(preference: ThemePreference): void {
  const root = document.documentElement;
  const resolvedTheme = resolveThemePreference(preference);
  root.classList.toggle("dark", resolvedTheme === "dark");
  root.style.colorScheme = resolvedTheme;
}

export function resolveThemePreference(preference: ThemePreference): "light" | "dark" {
  if (preference === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return preference;
}

function applyFontFamily(fontFamily: FontFamilyPreference): void {
  const value = fontFamilyValue(fontFamily);
  document.documentElement.style.setProperty("--spacezero-font-family", value);
  document.documentElement.style.setProperty("--font-sans", value);
}

function fontFamilyValue(fontFamily: FontFamilyPreference): string {
  switch (fontFamily) {
    case "geist":
      return "Geist, ui-sans-serif, system-ui, sans-serif";
    case "sf-pro":
      return "'SF Pro Text', -apple-system, BlinkMacSystemFont, ui-sans-serif, system-ui, sans-serif";
    case "inter":
      return "'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif";
    case "helvetica":
      return "'Helvetica Neue', Helvetica, Arial, ui-sans-serif, sans-serif";
    case "arial":
      return "Arial, ui-sans-serif, sans-serif";
    case "sf-mono":
      return "'SF Mono', ui-monospace, monospace";
    case "menlo":
      return "Menlo, ui-monospace, monospace";
    case "monaco":
      return "Monaco, ui-monospace, monospace";
    case "jetbrains-mono":
      return "'JetBrains Mono', ui-monospace, monospace";
    case "monospace":
      return "ui-monospace, monospace";
    case "system":
      return "'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif";
  }
}
