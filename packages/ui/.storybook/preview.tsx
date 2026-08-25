import type { Preview } from "@storybook/react-vite";

import "@spacezero/ui/styles.css";

const preview: Preview = {
  globalTypes: {
    theme: {
      description: "Space Zero theme",
      toolbar: {
        icon: "paintbrush",
        items: [
          { value: "light", title: "Light" },
          { value: "dark", title: "Dark" },
          { value: "dark-high-contrast", title: "Dark high contrast" },
        ],
      },
    },
  },
  initialGlobals: {
    theme: "dark",
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme as string;
      document.documentElement.classList.remove("dark", "dark-high-contrast");
      if (theme !== "light") document.documentElement.classList.add(theme);

      return (
        <div className="min-h-screen bg-background p-8 text-foreground">
          <Story />
        </div>
      );
    },
  ],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      disable: true,
    },
    docs: {
      codePanel: true,
    },
  },
};

export default preview;
