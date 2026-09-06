"use client";

import {
  createContext,
  type ComponentPropsWithoutRef,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from "react";
import { CaretDownIcon, CheckIcon } from "@phosphor-icons/react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "#lib/utils";

export type ModelSelectorEffortOption = {
  id: string;
  name: string;
};

export const DEFAULT_EFFORT_OPTIONS: readonly ModelSelectorEffortOption[] = [
  { id: "low", name: "Low" },
  { id: "medium", name: "Med" },
  { id: "high", name: "High" },
];

export type ModelOption = {
  id: string;
  name: string;
  description?: string;
  icon?: ReactNode;
  disabled?: boolean;
  keywords?: readonly string[];
  efforts?: boolean | readonly ModelSelectorEffortOption[];
};

function getModelEfforts(
  model: ModelOption | undefined,
): readonly ModelSelectorEffortOption[] | undefined {
  if (!model?.efforts) return undefined;
  return model.efforts === true ? DEFAULT_EFFORT_OPTIONS : model.efforts;
}

function resolveEffort(
  efforts: readonly ModelSelectorEffortOption[] | undefined,
  effort: string | undefined,
): string | undefined {
  if (effort === undefined) return undefined;
  return efforts?.some((option) => option.id === effort) ? effort : undefined;
}

export function resolveModelEffort(
  models: readonly ModelOption[],
  modelId: string | undefined,
  effort: string | undefined,
): string | undefined {
  return resolveEffort(
    getModelEfforts(models.find((model) => model.id === modelId)),
    effort,
  );
}

type ModelSelectorContextValue = {
  models: readonly ModelOption[];
  value: string | undefined;
  setValue: (value: string) => void;
  selectedModel: ModelOption | undefined;
  efforts: readonly ModelSelectorEffortOption[] | undefined;
  effort: string | undefined;
  setEffort: (effort: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  query: string;
  setQuery: (query: string) => void;
};

const ModelSelectorContext = createContext<ModelSelectorContextValue | null>(null);

export function useModelSelectorContext() {
  const ctx = useContext(ModelSelectorContext);
  if (!ctx) {
    throw new Error("ModelSelector sub-components must be used within ModelSelector.Root");
  }
  return ctx;
}

export function useModelSelectorEfforts(): {
  efforts: readonly ModelSelectorEffortOption[] | undefined;
  effort: string | undefined;
  setEffort: (effort: string) => void;
} {
  const { efforts, effort, setEffort } = useModelSelectorContext();
  return { efforts, effort, setEffort };
}

export type ModelSelectorRootProps = {
  models: readonly ModelOption[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  effort?: string;
  defaultEffort?: string;
  onEffortChange?: (effort: string) => void;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
};

function ModelSelectorRoot({
  models,
  value,
  defaultValue,
  onValueChange,
  effort,
  defaultEffort,
  onEffortChange,
  open,
  defaultOpen = false,
  onOpenChange,
  children,
}: ModelSelectorRootProps) {
  const [internalValue, setInternalValue] = useState(defaultValue ?? models[0]?.id);
  const [internalEffort, setInternalEffort] = useState(defaultEffort);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const [query, setQuery] = useState("");

  const actualValue = value ?? internalValue;
  const selectedModel = models.find((model) => model.id === actualValue);
  const efforts = getModelEfforts(selectedModel);
  const actualEffort = resolveEffort(efforts, effort ?? internalEffort);
  const actualOpen = open ?? internalOpen;

  const contextValue = useMemo<ModelSelectorContextValue>(
    () => ({
      models,
      value: actualValue,
      setValue: (next) => {
        if (value === undefined) setInternalValue(next);
        onValueChange?.(next);
      },
      selectedModel,
      efforts,
      effort: actualEffort,
      setEffort: (next) => {
        if (effort === undefined) setInternalEffort(next);
        onEffortChange?.(next);
      },
      open: actualOpen,
      setOpen: (next) => {
        if (open === undefined) setInternalOpen(next);
        onOpenChange?.(next);
      },
      query,
      setQuery,
    }),
    [
      actualEffort,
      actualOpen,
      actualValue,
      effort,
      efforts,
      models,
      onEffortChange,
      onOpenChange,
      onValueChange,
      open,
      query,
      selectedModel,
      value,
    ],
  );

  return (
    <ModelSelectorContext.Provider value={contextValue}>
      <div data-slot="model-selector-root" className="relative inline-flex">
        {children}
      </div>
    </ModelSelectorContext.Provider>
  );
}

export const modelSelectorTriggerVariants = cva(
  "flex w-fit items-center justify-between gap-2 overflow-hidden rounded-md text-sm whitespace-nowrap outline-none transition-colors focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        outline: "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        muted: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
      },
      size: {
        default: "h-9 px-3 py-2",
        sm: "h-8 px-2.5 py-1.5 text-xs",
        lg: "h-10 px-4 py-2.5",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "default",
    },
  },
);

export type ModelSelectorTriggerProps = ComponentPropsWithoutRef<"button"> &
  VariantProps<typeof modelSelectorTriggerVariants>;

function ModelSelectorTrigger({
  className,
  variant,
  size,
  children,
  onClick,
  onKeyDown,
  ...props
}: ModelSelectorTriggerProps) {
  const { open, setOpen } = useModelSelectorContext();

  return (
    <button
      type="button"
      data-slot="model-selector-trigger"
      data-variant={variant ?? "outline"}
      data-size={size ?? "default"}
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      className={cn(modelSelectorTriggerVariants({ variant, size }), className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(!open);
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setOpen(true);
        }
      }}
      {...props}
    >
      {children ?? <ModelSelectorValue />}
      <CaretDownIcon className="size-4 opacity-50" />
    </button>
  );
}

export type ModelSelectorValueProps = {
  placeholder?: ReactNode;
  showEffort?: boolean;
  className?: string;
};

function ModelIcon({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("flex size-3.5 shrink-0 items-center justify-center [&_svg]:size-3.5", className)}>
      {children}
    </span>
  );
}

function ModelSelectorValue({
  placeholder = "Select model",
  showEffort = true,
  className,
}: ModelSelectorValueProps) {
  const { selectedModel, efforts, effort } = useModelSelectorContext();

  if (!selectedModel) {
    return <span className={cn("text-muted-foreground", className)}>{placeholder}</span>;
  }

  const effortName =
    showEffort && effort !== undefined
      ? efforts?.find((option) => option.id === effort)?.name
      : undefined;

  return (
    <span data-slot="model-selector-value" className={cn("flex min-w-0 items-center gap-2", className)}>
      {selectedModel.icon && <ModelIcon>{selectedModel.icon}</ModelIcon>}
      <span className="truncate font-medium">{selectedModel.name}</span>
      {effortName && <span className="min-w-7.5 truncate text-center text-muted-foreground">{effortName}</span>}
    </span>
  );
}

export type ModelSelectorContentProps = ComponentPropsWithoutRef<"div"> & {
  searchable?: boolean;
  align?: "start" | "end";
};

function ModelSelectorContent({
  className,
  searchable,
  align = "start",
  children,
  ...props
}: ModelSelectorContentProps) {
  const { open } = useModelSelectorContext();
  if (!open) return null;

  return (
    <div
      data-slot="model-selector-content"
      className={cn(
        "absolute top-full z-50 mt-1 w-72 overflow-hidden rounded-xl border border-border bg-popover p-0 shadow-md",
        align === "end" ? "end-0" : "start-0",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          {searchable && <ModelSelectorSearch />}
          <ModelSelectorList />
          <ModelSelectorEffort />
        </>
      )}
    </div>
  );
}

export type ModelSelectorSearchProps = ComponentPropsWithoutRef<"input">;

function ModelSelectorSearch({ className, placeholder = "Search models...", ...props }: ModelSelectorSearchProps) {
  const { query, setQuery } = useModelSelectorContext();

  return (
    <input
      data-slot="model-selector-search"
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      placeholder={placeholder}
      className={cn("h-9 w-full border-b bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground", className)}
      {...props}
    />
  );
}

export type ModelSelectorListProps = ComponentPropsWithoutRef<"div">;

function ModelSelectorList({ className, children, ...props }: ModelSelectorListProps) {
  const { models, query } = useModelSelectorContext();
  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? models.filter((model) =>
        [model.id, model.name, model.description, ...(model.keywords ?? [])]
          .filter(Boolean)
          .some((value) => value?.toLowerCase().includes(normalized)),
      )
    : models;

  return (
    <div
      data-slot="model-selector-list"
      role="listbox"
      className={cn("max-h-72 overflow-y-auto p-1", className)}
      {...props}
    >
      {children ??
        (filtered.length > 0 ? (
          filtered.map((model) => <ModelSelectorItem key={model.id} model={model} />)
        ) : (
          <ModelSelectorEmpty />
        ))}
    </div>
  );
}

export type ModelSelectorEmptyProps = ComponentPropsWithoutRef<"div">;

function ModelSelectorEmpty({ children, className, ...props }: ModelSelectorEmptyProps) {
  return (
    <div data-slot="model-selector-empty" className={cn("px-3 py-6 text-center text-sm text-muted-foreground", className)} {...props}>
      {children ?? "No models found."}
    </div>
  );
}

export type ModelSelectorGroupProps = ComponentPropsWithoutRef<"div">;
function ModelSelectorGroup(props: ModelSelectorGroupProps) {
  return <div data-slot="model-selector-group" {...props} />;
}

export type ModelSelectorSeparatorProps = ComponentPropsWithoutRef<"div">;
function ModelSelectorSeparator({ className, ...props }: ModelSelectorSeparatorProps) {
  return <div data-slot="model-selector-separator" className={cn("my-1 h-px bg-border", className)} {...props} />;
}

export type ModelSelectorItemProps = Omit<ComponentPropsWithoutRef<"button">, "value"> & {
  model: ModelOption;
};

function ModelSelectorItem({ model, className, children, onClick, ...props }: ModelSelectorItemProps) {
  const { value, setValue, setOpen } = useModelSelectorContext();
  const isSelected = value === model.id;

  return (
    <button
      type="button"
      data-slot="model-selector-item"
      role="option"
      aria-selected={isSelected}
      disabled={model.disabled}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented || model.disabled) return;
        setValue(model.id);
        setOpen(false);
      }}
      className={cn(
        "relative flex w-full items-start gap-2 rounded-lg py-2 ps-3 pe-9 text-start text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          {model.icon && <ModelIcon className="mt-[3px]">{model.icon}</ModelIcon>}
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{model.name}</span>
            {model.description && <span className="truncate text-xs text-muted-foreground">{model.description}</span>}
          </span>
        </>
      )}
      {isSelected && (
        <span className="absolute end-3 top-2.5 flex size-4 items-center justify-center">
          <CheckIcon className="size-4" />
        </span>
      )}
    </button>
  );
}

export type ModelSelectorEffortProps = ComponentPropsWithoutRef<"div"> & {
  label?: ReactNode;
};

function ModelSelectorEffort({ label = "Thinking", className, ...props }: ModelSelectorEffortProps) {
  const { efforts, effort, setEffort } = useModelSelectorEfforts();
  if (!efforts?.length) return null;

  return (
    <div data-slot="model-selector-effort" className={cn("flex cursor-default items-center justify-between gap-3 border-t px-3 py-2", className)} {...props}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div role="radiogroup" aria-label={typeof label === "string" ? label : "Reasoning effort"} className="flex items-center gap-0.5">
        {efforts.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={effort === option.id}
            onClick={() => setEffort(option.id)}
            className={cn(
              "cursor-pointer rounded-md px-2 py-1 text-xs text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring/50",
              effort === option.id && "bg-accent font-medium text-accent-foreground",
            )}
          >
            {option.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export type ModelSelectorProps = Omit<ModelSelectorRootProps, "children"> &
  VariantProps<typeof modelSelectorTriggerVariants> & {
    searchable?: boolean;
    align?: ModelSelectorContentProps["align"];
    className?: string;
    contentClassName?: string;
  };

function ModelSelector({
  searchable,
  align,
  className,
  contentClassName,
  variant,
  size,
  ...props
}: ModelSelectorProps) {
  return (
    <ModelSelectorRoot {...props}>
      <ModelSelectorTrigger variant={variant} size={size} className={className} />
      <ModelSelectorContent
        {...(searchable !== undefined ? { searchable } : {})}
        {...(align !== undefined ? { align } : {})}
        {...(contentClassName !== undefined ? { className: contentClassName } : {})}
      />
    </ModelSelectorRoot>
  );
}

export {
  ModelSelector,
  ModelSelectorRoot,
  ModelSelectorTrigger,
  ModelSelectorValue,
  ModelSelectorContent,
  ModelSelectorSearch,
  ModelSelectorList,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorSeparator,
  ModelSelectorItem,
  ModelSelectorEffort,
};
