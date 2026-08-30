import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app.js";
import { initializeRendererI18n } from "./i18n";
import "@spacezero/ui/globals.css";
import "./styles.css";

void initializeRendererI18n().finally(() => {
  createRoot(document.getElementById("root") as HTMLElement).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
