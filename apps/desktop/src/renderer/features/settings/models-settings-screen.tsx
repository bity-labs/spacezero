import { Key, Plus, Plugs, Trash } from "@phosphor-icons/react";
import { Alert, AlertDescription } from "@spacezero/ui/components/alert";
import { Badge } from "@spacezero/ui/components/badge";
import { Button } from "@spacezero/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@spacezero/ui/components/dialog";
import { EmptyState } from "@spacezero/ui/components/empty";
import { Input } from "@spacezero/ui/components/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@spacezero/ui/components/select";
import { Skeleton } from "@spacezero/ui/components/skeleton";
import { Text } from "@spacezero/ui/components/typography";
import { useState, type ReactElement, type ReactNode } from "react";

import { SettingsPageHeader } from "./components/settings-page-header";
import { SettingsRow } from "./components/settings-row";
import { SettingsSection } from "./components/settings-section";

type AuthProviderOption = {
  providerId: string;
  label: string;
  description?: string;
};

type AuthProviderStatus = {
  providerId: string;
  label: string;
  configured: boolean;
  displayLabel?: string;
  source?: string;
  removable: boolean;
};

type ModelAuthSettings = {
  subscriptions: {
    connected: AuthProviderStatus[];
    availableProviders: AuthProviderOption[];
  };
  apiKeys: {
    configured: AuthProviderStatus[];
    availableProviders: AuthProviderOption[];
  };
};

type AvailableModel = {
  providerId: string;
  providerLabel: string;
  modelId: string;
  modelLabel: string;
  description?: string;
  supportsThinking: boolean;
};

type ModelDefaults = {
  defaultModel?: { providerId: string; modelId: string };
  defaultThinking?: ThinkingLevel;
};

type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

const THINKING_LEVELS: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

export type ModelsSettingsScreenProps = {
  authSettings: ModelAuthSettings | null;
  availableModels: AvailableModel[];
  modelDefaults: ModelDefaults | null;
  isLoading: boolean;
  error: string | null;
  pendingProviderId: string | null;
  subscriptionStatusMessage: string | null;
  subscriptionPickerOpen: boolean;
  apiKeyPickerOpen: boolean;
  selectedApiKeyProvider: AuthProviderOption | null;
  apiKey: string;
  defaultModelPickerOpen: boolean;
  onSubscriptionPickerOpenChange: (open: boolean) => void;
  onApiKeyPickerOpenChange: (open: boolean) => void;
  onApiKeyProviderSelect: (provider: AuthProviderOption) => void;
  onApiKeyChange: (apiKey: string) => void;
  onApiKeyDialogClose: () => void;
  onConnectSubscription: (provider: AuthProviderOption) => void;
  onDisconnectSubscription: (provider: AuthProviderStatus) => void;
  onSaveApiKey: () => void;
  onRemoveApiKey: (provider: AuthProviderStatus) => void;
  onDefaultModelPickerOpenChange: (open: boolean) => void;
  onSelectDefaultModel: (model: AvailableModel) => void;
  onSelectDefaultThinking: (thinking: ThinkingLevel) => void;
};

export function ModelsSettingsScreen({
  authSettings,
  availableModels,
  modelDefaults,
  isLoading,
  error,
  pendingProviderId,
  subscriptionStatusMessage,
  subscriptionPickerOpen,
  apiKeyPickerOpen,
  selectedApiKeyProvider,
  apiKey,
  defaultModelPickerOpen,
  onSubscriptionPickerOpenChange,
  onApiKeyPickerOpenChange,
  onApiKeyProviderSelect,
  onApiKeyChange,
  onApiKeyDialogClose,
  onConnectSubscription,
  onDisconnectSubscription,
  onSaveApiKey,
  onRemoveApiKey,
  onDefaultModelPickerOpenChange,
  onSelectDefaultModel,
  onSelectDefaultThinking,
}: ModelsSettingsScreenProps): ReactElement {
  return (
    <>
      <SettingsPageHeader title="Models" />
      <div className="flex flex-col gap-8">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <ModelAuthCard
          title="Subscriptions"
          description="Connect model subscriptions that Space Zero can use."
          addLabel="Add subscription"
          emptyTitle="No subscriptions connected"
          emptyDescription="Connect a supported subscription to make its models available."
          icon={<Plugs className="size-4" aria-hidden="true" />}
          isLoading={isLoading}
          providers={authSettings?.subscriptions.connected ?? []}
          pendingProviderId={pendingProviderId}
          statusMessage={subscriptionStatusMessage}
          onAdd={() => onSubscriptionPickerOpenChange(true)}
          onRemove={onDisconnectSubscription}
          removeLabel="Disconnect subscription"
        />

        <ModelAuthCard
          title="API keys"
          description="Store provider API keys for model access."
          addLabel="Add API key"
          emptyTitle="No API keys configured"
          emptyDescription="Add a provider API key to make its models available."
          icon={<Key className="size-4" aria-hidden="true" />}
          isLoading={isLoading}
          providers={authSettings?.apiKeys.configured ?? []}
          pendingProviderId={pendingProviderId}
          onAdd={() => onApiKeyPickerOpenChange(true)}
          onRemove={onRemoveApiKey}
          removeLabel="Remove API key"
        />

        <ModelDefaultsCard
          isLoading={isLoading}
          availableModels={availableModels}
          modelDefaults={modelDefaults}
          pickerOpen={defaultModelPickerOpen}
          onPickerOpenChange={onDefaultModelPickerOpenChange}
          onSelectDefaultModel={onSelectDefaultModel}
          onSelectDefaultThinking={onSelectDefaultThinking}
        />

      </div>

      <ProviderPickerDialog
        open={subscriptionPickerOpen}
        title="Connect subscription"
        description="Choose a subscription provider to connect."
        providers={authSettings?.subscriptions.availableProviders ?? []}
        pendingProviderId={pendingProviderId}
        onOpenChange={onSubscriptionPickerOpenChange}
        onSelect={onConnectSubscription}
      />

      <ProviderPickerDialog
        open={apiKeyPickerOpen}
        title="Add API key"
        description="Choose an API-key provider."
        providers={authSettings?.apiKeys.availableProviders ?? []}
        pendingProviderId={pendingProviderId}
        onOpenChange={onApiKeyPickerOpenChange}
        onSelect={onApiKeyProviderSelect}
      />

      <Dialog open={selectedApiKeyProvider !== null} onOpenChange={(open) => !open && onApiKeyDialogClose()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter API key</DialogTitle>
            <DialogDescription>
              {selectedApiKeyProvider ? `Paste the API key for ${selectedApiKeyProvider.label}.` : null}
            </DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            value={apiKey}
            aria-label="API key"
            placeholder="Paste API key"
            autoComplete="off"
            onChange={(event) => onApiKeyChange(event.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={onApiKeyDialogClose}>Cancel</Button>
            <Button disabled={!apiKey.trim() || pendingProviderId === selectedApiKeyProvider?.providerId} onClick={onSaveApiKey}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ModelDefaultsCard({
  isLoading,
  availableModels,
  modelDefaults,
  pickerOpen,
  onPickerOpenChange,
  onSelectDefaultModel,
  onSelectDefaultThinking,
}: {
  isLoading: boolean;
  availableModels: AvailableModel[];
  modelDefaults: ModelDefaults | null;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  onSelectDefaultModel: (model: AvailableModel) => void;
  onSelectDefaultThinking: (thinking: ThinkingLevel) => void;
}): ReactElement {
  const selectedModel = findSelectedModel(availableModels, modelDefaults?.defaultModel);
  const hasUnavailableDefault = Boolean(modelDefaults?.defaultModel && !selectedModel);

  return (
    <>
      <SettingsSection title="Defaults">
        {isLoading ? (
          <SettingsContentPlaceholder rows={2} />
        ) : availableModels.length === 0 ? (
          <EmptyState title="No models available" description="Connect a subscription or API key before choosing a default model." />
        ) : (
          <>
            {hasUnavailableDefault ? (
              <Text variant="danger" className="border-b border-border/70 px-4 py-3">The selected default model is no longer available.</Text>
            ) : null}
            <SettingsRow title="Default model" description="Choose the model used for new agent sessions.">
              <Button variant="outline" size="sm" onClick={() => onPickerOpenChange(true)}>
                {selectedModel ? `${selectedModel.providerLabel} · ${selectedModel.modelLabel}` : "Choose model"}
              </Button>
            </SettingsRow>
            <SettingsRow title="Default thinking" description="Choose the default reasoning effort for supported models.">
              <Select value={modelDefaults?.defaultThinking ?? "medium"} onValueChange={(value) => onSelectDefaultThinking(value as ThinkingLevel)}>
                <SelectTrigger size="sm" className="w-40" aria-label="Default thinking">
                  <SelectValue>{(value: ThinkingLevel) => getThinkingLevelLabel(value)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {THINKING_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>{getThinkingLevelLabel(level)}</SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </SettingsRow>
          </>
        )}
      </SettingsSection>

      <ModelBrowserDialog
        open={pickerOpen}
        title="Choose default model"
        description="Search available models and choose the default for new sessions."
        models={availableModels}
        modelDefaults={modelDefaults}
        onOpenChange={onPickerOpenChange}
        onAction={onSelectDefaultModel}
      />
    </>
  );
}

function ModelAuthCard({
  title,
  description,
  addLabel,
  emptyTitle,
  emptyDescription,
  icon,
  isLoading,
  providers,
  pendingProviderId,
  removeLabel,
  statusMessage,
  onAdd,
  onRemove,
}: {
  title: string;
  description: string;
  addLabel: string;
  emptyTitle: string;
  emptyDescription: string;
  icon: ReactNode;
  isLoading: boolean;
  providers: AuthProviderStatus[];
  pendingProviderId: string | null;
  removeLabel: string;
  statusMessage?: string | null;
  onAdd: () => void;
  onRemove: (provider: AuthProviderStatus) => void;
}): ReactElement {
  return (
    <SettingsSection title={title} description={description}>
      {statusMessage ? <Text role="status" aria-live="polite" variant="muted" className="border-b border-border/70 px-4 py-3">{statusMessage}</Text> : null}
      {isLoading ? (
        <SettingsContentPlaceholder rows={2} />
      ) : providers.length === 0 ? (
        <EmptyState
          icon={icon}
          title={emptyTitle}
          description={emptyDescription}
          actions={<Button variant="outline" size="sm" className="gap-2" onClick={onAdd}><Plus className="size-4" aria-hidden="true" />{addLabel}</Button>}
        />
      ) : (
        <>
          {providers.map((provider) => (
            <ProviderSettingsItem
              key={`${provider.providerId}-${provider.source ?? "unknown"}`}
              title={provider.label}
              description={provider.displayLabel ?? "Connected"}
              action={
                provider.removable ? (
                  <Button variant="outline" size="icon-sm" disabled={pendingProviderId === provider.providerId} aria-label={removeLabel} onClick={() => onRemove(provider)}>
                    <Trash className="size-4" aria-hidden="true" />
                  </Button>
                ) : (
                  <Badge variant="secondary">Managed</Badge>
                )
              }
            />
          ))}
          <div className="border-t border-border/70 px-4 py-3">
            <Button variant="outline" size="sm" className="gap-2" onClick={onAdd}>
              <Plus className="size-4" aria-hidden="true" />
              {addLabel}
            </Button>
          </div>
        </>
      )}
    </SettingsSection>
  );
}

function SettingsContentPlaceholder({ rows }: { rows: number }): ReactElement {
  return (
    <div aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="flex min-h-[72px] items-center gap-4 border-b border-border/70 px-4 py-4 last:border-b-0"
        >
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-2 h-3 w-56" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
      ))}
    </div>
  );
}

function ProviderSettingsItem({
  title,
  description,
  details,
  badge,
  action,
  onClick,
}: {
  title: string;
  description?: string;
  details?: string | undefined;
  badge?: ReactNode;
  action?: ReactNode;
  onClick?: () => void;
}): ReactElement {
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <Text as="div" variant="label" className="truncate leading-5">{title}</Text>
        {description ? <Text as="div" variant="subtle" className="mt-1 truncate leading-4">{description}</Text> : null}
        {details ? <Text as="div" variant="subtle" className="mt-1 line-clamp-2 leading-4">{details}</Text> : null}
      </div>
      {badge ? <div className="shrink-0">{badge}</div> : null}
      {action ? <div className="shrink-0">{action}</div> : null}
    </>
  );

  if (onClick) {
    return <button type="button" className="flex w-full items-center gap-3 rounded-md border px-3 py-3 text-left transition-colors hover:bg-accent hover:text-accent-foreground" onClick={onClick}>{content}</button>;
  }

  return <div className="flex min-h-[72px] items-center gap-4 border-b border-border/70 px-4 py-4 last:border-b-0">{content}</div>;
}

function ProviderPickerDialog({
  open,
  title,
  description,
  providers,
  pendingProviderId,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  title: string;
  description: string;
  providers: AuthProviderOption[];
  pendingProviderId: string | null;
  onOpenChange: (open: boolean) => void;
  onSelect: (provider: AuthProviderOption) => void;
}): ReactElement {
  const [query, setQuery] = useState("");
  const filteredProviders = providers.filter((provider) => `${provider.label} ${provider.description ?? ""}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input value={query} aria-label="Search providers" placeholder="Search providers" onChange={(event) => setQuery(event.target.value)} />
        <div className="flex max-h-72 flex-col gap-2 overflow-auto">
          {filteredProviders.length === 0 ? (
            <p className="rounded-md border px-3 py-4 text-sm text-muted-foreground">No providers found.</p>
          ) : (
            filteredProviders.map((provider) => (
              <Button key={provider.providerId} variant="outline" className="h-auto w-full justify-start px-3 py-3 text-left" disabled={pendingProviderId === provider.providerId} onClick={() => onSelect(provider)}>
                <span>
                  <span className="block text-sm font-medium">{provider.label}</span>
                  {provider.description ? <span className="mt-1 block text-xs text-muted-foreground">{provider.description}</span> : null}
                </span>
              </Button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ModelBrowserDialog({
  open,
  title,
  description,
  models,
  modelDefaults,
  onOpenChange,
  onAction,
}: {
  open: boolean;
  title: string;
  description: string;
  models: AvailableModel[];
  modelDefaults: ModelDefaults | null;
  onOpenChange: (open: boolean) => void;
  onAction: (model: AvailableModel) => void;
}): ReactElement {
  const [query, setQuery] = useState("");
  const providerGroups = groupModelsByProvider(filterModels(models, query), modelDefaults?.defaultModel);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Input value={query} aria-label="Search models" placeholder="Search models" onChange={(event) => setQuery(event.target.value)} />
        <div className="flex max-h-96 flex-col gap-4 overflow-auto pr-1">
          {providerGroups.length === 0 ? (
            <p className="rounded-md border px-3 py-4 text-sm text-muted-foreground">No models match your search.</p>
          ) : (
            providerGroups.map((group) => (
              <section key={group.providerId} aria-label={group.providerLabel} className="flex flex-col gap-2">
                <h4><Text as="span" variant="label" className="text-muted-foreground">{group.providerLabel}</Text></h4>
                <div className="flex flex-col gap-2">
                  {group.models.map((model) => {
                    const isDefault = isSameModel(model, modelDefaults?.defaultModel);
                    return (
                      <ProviderSettingsItem
                        key={`${model.providerId}-${model.modelId}`}
                        title={model.modelLabel}
                        description={model.providerLabel}
                        details={model.description}
                        badge={isDefault ? <Badge variant="secondary">Default</Badge> : null}
                        onClick={() => onAction(model)}
                      />
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function findSelectedModel(availableModels: AvailableModel[], defaultModel: ModelDefaults["defaultModel"]): AvailableModel | undefined {
  if (!defaultModel) return undefined;
  return availableModels.find((model) => isSameModel(model, defaultModel));
}

function isSameModel(model: AvailableModel, defaultModel: ModelDefaults["defaultModel"]): boolean {
  return model.providerId === defaultModel?.providerId && model.modelId === defaultModel.modelId;
}

function groupModelsByProvider(models: AvailableModel[], defaultModel: ModelDefaults["defaultModel"]): Array<{ providerId: string; providerLabel: string; models: AvailableModel[] }> {
  const groups = new Map<string, { providerId: string; providerLabel: string; models: AvailableModel[] }>();
  for (const model of models) {
    const existing = groups.get(model.providerId);
    if (existing) existing.models.push(model);
    else groups.set(model.providerId, { providerId: model.providerId, providerLabel: model.providerLabel, models: [model] });
  }
  return [...groups.values()].map((group) => ({
    ...group,
    models: group.models.sort((a, b) => {
      if (isSameModel(a, defaultModel)) return -1;
      if (isSameModel(b, defaultModel)) return 1;
      return a.modelLabel.localeCompare(b.modelLabel);
    }),
  })).sort((a, b) => {
    const aHasDefault = a.models.some((model) => isSameModel(model, defaultModel));
    const bHasDefault = b.models.some((model) => isSameModel(model, defaultModel));
    if (aHasDefault) return -1;
    if (bHasDefault) return 1;
    return a.providerLabel.localeCompare(b.providerLabel);
  });
}

function filterModels(models: AvailableModel[], query: string): AvailableModel[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return models;
  return models.filter((model) => `${model.providerLabel} ${model.modelLabel} ${model.modelId}`.toLowerCase().includes(normalizedQuery));
}

function getThinkingLevelLabel(level: ThinkingLevel): string {
  const labels: Record<ThinkingLevel, string> = {
    off: "Off",
    minimal: "Minimal",
    low: "Low",
    medium: "Medium",
    high: "High",
    xhigh: "Extra high",
    max: "Max",
  };
  return labels[level];
}
