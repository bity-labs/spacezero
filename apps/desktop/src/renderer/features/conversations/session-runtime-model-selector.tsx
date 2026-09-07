import type { ReactElement } from "react";
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
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max";

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
    ...(model.description === undefined ? {} : { description: model.description }),
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
}: SessionRuntimeModelSelectorProps): ReactElement {
  return (
    <ModelSelectorRoot
      models={toSelectorModelOptions(models)}
      {...(selectedModelId === undefined
        ? {}
        : { value: selectedModelId })}
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
