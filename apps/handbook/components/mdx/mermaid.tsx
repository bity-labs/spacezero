"use client";

import { useEffect, useId, useState } from "react";
import { useTheme } from "next-themes";
import type { RenderResult } from "mermaid";

interface MermaidProps {
  readonly chart: string;
}

type MermaidRenderState =
  | {
      readonly status: "pending";
    }
  | {
      readonly status: "ready";
      readonly svg: string;
      readonly bindFunctions: RenderResult["bindFunctions"];
    }
  | {
      readonly status: "failed";
    };

export function Mermaid({ chart }: MermaidProps) {
  const rawId = useId();
  const id = `spacezero-mermaid-${rawId.replaceAll(":", "")}`;
  const { resolvedTheme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [state, setState] = useState<MermaidRenderState>({
    status: "pending",
  });

  useEffect(() => {
    let cancelled = false;

    async function renderChart() {
      setState({ status: "pending" });

      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          fontFamily: "inherit",
          theme: resolvedTheme === "dark" ? "dark" : "default",
          themeCSS: "margin: 0 auto;",
        });

        const result = await mermaid.render(
          id,
          chart.trim().replaceAll("\\n", "\n"),
        );

        if (!cancelled) {
          setState({
            status: "ready",
            svg: result.svg,
            bindFunctions: result.bindFunctions,
          });
        }
      } catch {
        if (!cancelled) {
          setState({ status: "failed" });
        }
      }
    }

    void renderChart();

    return () => {
      cancelled = true;
    };
  }, [chart, id, resolvedTheme]);

  useEffect(() => {
    if (!expanded) return;

    const previousOverflow = document.body.style.overflow;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setExpanded(false);
      }
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [expanded]);

  if (state.status === "pending") {
    return (
      <div className="my-6 rounded-lg border bg-fd-card p-4 text-sm text-fd-muted-foreground">
        Rendering diagram…
      </div>
    );
  }

  if (state.status === "failed") {
    return (
      <pre className="my-6 overflow-x-auto rounded-lg border bg-fd-card p-4 text-sm">
        <code>{chart}</code>
      </pre>
    );
  }

  return (
    <figure
      className={
        expanded
          ? "fixed inset-0 z-50 m-0 flex flex-col gap-3 bg-fd-background p-4"
          : "my-6 overflow-hidden rounded-lg border bg-fd-card"
      }
    >
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2 text-sm">
        <figcaption className="font-medium text-fd-muted-foreground">
          Diagram
        </figcaption>
        <button
          className="rounded-md border px-2.5 py-1 text-xs font-medium text-fd-foreground hover:bg-fd-accent"
          type="button"
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? "Close" : "Open large"}
        </button>
      </div>
      <div
        className={
          expanded
            ? "min-h-0 flex-1 overflow-auto rounded-lg border bg-fd-card p-6"
            : "overflow-x-auto p-4"
        }
        ref={(container) => {
          if (container) state.bindFunctions?.(container);
        }}
        dangerouslySetInnerHTML={{ __html: state.svg }}
      />
    </figure>
  );
}
