import { useState, type ReactElement } from "react";
import {
  ComposerMenu,
  ComposerMenuItem,
  ComposerModelItem,
  ComposerModelTrigger,
} from "@spacezero/ui/components/assistant-ui/elements/composer";
import {
  ModelSelectorContent,
  ModelSelectorEffort,
  ModelSelectorList,
  ModelSelectorRoot,
  ModelSelectorSearch,
  ModelSelectorTrigger,
  type ModelOption,
} from "@spacezero/ui/components/assistant-ui/elements/model-selector";

export type SessionRuntimeThinkingLevel =
  "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export type SessionRuntimeModelOption = {
  /** Stable option ID: `${providerId}:${modelId}` from a sanitized descriptor. */
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly supportedThinkingLevels: readonly SessionRuntimeThinkingLevel[];
};

export type SessionRuntimeModelSelectorProps = {
  readonly models: readonly SessionRuntimeModelOption[];
  readonly selectedModelId: string | undefined;
  readonly selectedThinkingLevel: SessionRuntimeThinkingLevel | undefined;
  readonly onModelChange: (modelOptionId: string) => void;
  readonly onThinkingLevelChange: (level: SessionRuntimeThinkingLevel) => void;
  readonly disabled?: boolean;
  /** Accessible name of the model selector trigger. */
  readonly label: string;
  /** Label shown above the thinking-level selection inside the selector. */
  readonly thinkingLabel: string;
  /** Composer placement opens upward to stay visible at the bottom of the thread. */
  readonly placement?: "header" | "composer";
};

const THINKING_LEVEL_NAMES: Record<SessionRuntimeThinkingLevel, string> = {
  off: "Off",
  minimal: "Min",
  low: "Low",
  medium: "Med",
  high: "High",
  xhigh: "XHigh",
  max: "Max",
};

export const thinkingLevelName = (level: SessionRuntimeThinkingLevel): string =>
  THINKING_LEVEL_NAMES[level];

/**
 * Builds the ModelSelector model options from sanitized runtime descriptors.
 * Selection is provider+model aware; thinking levels come from the Host
 * model catalog, never from client-side guesses.
 */
export const toSelectorModelOptions = (
  models: readonly SessionRuntimeModelOption[],
): readonly ModelOption[] =>
  models.map((model) => ({
    id: model.id,
    name: model.name,
    ...(model.description === undefined
      ? {}
      : { description: model.description }),
    efforts: model.supportedThinkingLevels.map((level) => ({
      id: level,
      name: thinkingLevelName(level),
    })),
  }));

/**
 * Chat-surface runtime configuration composition: provider/model selection and
 * thinking-level selection flow through one ModelSelector composition backed by
 * the Host-owned per-session runtime configuration. Props-driven and
 * Effect-free; the container owns runtime configuration reads and updates.
 */
export function SessionRuntimeModelSelector({
  models,
  selectedModelId,
  selectedThinkingLevel,
  onModelChange,
  onThinkingLevelChange,
  disabled = false,
  label,
  thinkingLabel,
  placement = "header",
}: SessionRuntimeModelSelectorProps): ReactElement {
  const [composerOpen, setComposerOpen] = useState(false);
  const selectedModel = models.find((model) => model.id === selectedModelId);
  const selectedThinkingName = selectedThinkingLevel
    ? thinkingLevelName(selectedThinkingLevel)
    : undefined;

  if (placement === "composer") {
    return (
      <div className="relative" data-testid="session-runtime-model-selector">
        <ComposerModelTrigger
          model={[selectedModel?.name ?? "Select model", selectedThinkingName]
            .filter(Boolean)
            .join(" · ")}
          open={composerOpen}
          aria-label={label}
          disabled={disabled}
          data-testid="session-runtime-model-selector-trigger"
          onClick={() => setComposerOpen((open) => !open)}
        />
        <ComposerMenu open={composerOpen} align="start" width="content">
          <div
            role="listbox"
            aria-label={label}
            className="max-h-56 overflow-y-auto"
          >
            {models.map((model) => (
              <ComposerModelItem
                key={model.id}
                entry={{ name: model.name, meta: model.description ?? "" }}
                selected={model.id === selectedModelId}
                role="option"
                aria-selected={model.id === selectedModelId}
                onClick={() => {
                  setComposerOpen(false);
                  onModelChange(model.id);
                }}
              />
            ))}
          </div>
          {selectedModel?.supportedThinkingLevels.length ? (
            <div className="border-t border-border/60 px-2 py-2">
              <div className="mb-1 px-1 text-xs text-muted-foreground">
                {thinkingLabel}
              </div>
              <div
                role="radiogroup"
                aria-label={thinkingLabel}
                className="flex flex-wrap gap-1"
              >
                {selectedModel.supportedThinkingLevels.map((level) => (
                  <ComposerMenuItem
                    key={level}
                    role="radio"
                    aria-checked={level === selectedThinkingLevel}
                    active={level === selectedThinkingLevel}
                    className="w-auto px-2 py-1 text-xs"
                    onClick={() => onThinkingLevelChange(level)}
                  >
                    {thinkingLevelName(level)}
                  </ComposerMenuItem>
                ))}
              </div>
            </div>
          ) : null}
        </ComposerMenu>
      </div>
    );
  }

  return (
    <ModelSelectorRoot
      models={toSelectorModelOptions(models)}
      {...(selectedModelId === undefined ? {} : { value: selectedModelId })}
      {...(selectedThinkingLevel === undefined
        ? {}
        : { effort: selectedThinkingLevel })}
      onValueChange={onModelChange}
      onEffortChange={(level) =>
        onThinkingLevelChange(level as SessionRuntimeThinkingLevel)
      }
    >
      <ModelSelectorTrigger
        variant="outline"
        size="sm"
        aria-label={label}
        disabled={disabled}
        data-testid="session-runtime-model-selector-trigger"
      />
      <ModelSelectorContent searchable align="end">
        <ModelSelectorSearch />
        <ModelSelectorList />
        <ModelSelectorEffort label={thinkingLabel} />
      </ModelSelectorContent>
    </ModelSelectorRoot>
  );
}
