import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: "Space Zero Handbook",
    },
    links: [
      {
        text: "Repository docs",
        url: "https://github.com/bity-labs/spacezero/tree/main/docs",
        external: true,
      },
    ],
  };
}
