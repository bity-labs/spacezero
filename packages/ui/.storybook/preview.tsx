import type { Preview } from "@storybook/react-vite";

import "@spacezero/ui/globals.css";

type ThemeName = "light" | "dark";

const themeClasses: ThemeName[] = ["light", "dark"];

function applyTheme(theme: ThemeName) {
  const root = document.documentElement;

  root.classList.remove(...themeClasses);
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Space Zero theme",
      defaultValue: "dark",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [
    (Story, context) => {
      applyTheme((context.globals.theme ?? "dark") as ThemeName);

      return (
        <div className="min-h-screen bg-background p-8 text-foreground">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    backgrounds: { disable: true },
    layout: "centered",
    options: {
      storySort: {
        order: ["Design System", "Features", "Screens"],
      },
    },
  },
};

export default preview;
