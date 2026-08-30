import { PencilSimple, Trash } from "@phosphor-icons/react";
import { Badge } from "@spacezero/ui/components/badge";
import { Button } from "@spacezero/ui/components/button";
import { Switch } from "@spacezero/ui/components/switch";
import { Text } from "@spacezero/ui/components/typography";
import type { ReactElement } from "react";

export type AgentCapabilityScope = "User" | "Project" | "Built-in" | "Planned";

export type AgentCapabilityRowProps = {
  name: string;
  scope: AgentCapabilityScope;
  description: string;
  path?: string;
  enabled: boolean;
  disabled?: boolean;
  editing?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
};

export function AgentCapabilityRow({
  name,
  scope,
  description,
  path,
  enabled,
  disabled,
  editing = false,
  onEdit,
  onDelete,
}: AgentCapabilityRowProps): ReactElement {
  return (
    <div className="flex min-h-[72px] items-center gap-4 border-b border-border/70 px-4 py-4 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Text variant="label" className="leading-5">
            {name}
          </Text>
          <Badge variant={scope === "Planned" ? "outline" : "secondary"}>
            {scope}
          </Badge>
        </div>
        <Text variant="subtle" className="mt-1 leading-4">
          {description}
        </Text>
        {path ? (
          <Text variant="subtle" className="mt-2 break-all leading-4">
            Path: {path}
          </Text>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-4 self-center">
        {editing ? (
          <div className="flex items-center gap-0">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:bg-transparent hover:text-destructive"
              aria-label={`Delete ${name}`}
              onClick={onDelete}
            >
              <Trash className="size-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="text-muted-foreground hover:bg-transparent hover:text-foreground"
              aria-label={`Edit ${name}`}
              onClick={onEdit}
            >
              <PencilSimple className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ) : null}
        <Switch
          aria-label={`${enabled ? "Disable" : "Enable"} ${name}`}
          defaultChecked={enabled}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
