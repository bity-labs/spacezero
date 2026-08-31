import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.js";
import { applyAppearanceSettings } from "./features/settings/appearance-preferences";
import { initializeRendererI18n } from "./i18n";
import "@spacezero/ui/globals.css";
import "./styles.css";

void Promise.all([
  initializeRendererI18n(),
  window.spacezero.settings.getAppearanceSettings().then((settings) => applyAppearanceSettings(settings)),
]).finally(() => {
  createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
