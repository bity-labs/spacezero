import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@spacezero/ui/components/select";
import type { ReactElement } from "react";

export type AgentCapabilityConfigScope = "global" | "project";

export type AgentCapabilityConfigSelectProps = {
  value: AgentCapabilityConfigScope;
  onValueChange: (value: AgentCapabilityConfigScope) => void;
};

export function AgentCapabilityConfigSelect({
  value,
  onValueChange,
}: AgentCapabilityConfigSelectProps): ReactElement {
  return (
    <Select
      value={value}
      onValueChange={(nextValue) =>
        onValueChange(nextValue as AgentCapabilityConfigScope)
      }
    >
      <SelectTrigger
        size="sm"
        className="w-52"
        aria-label="Agent capability configuration scope"
      >
        <SelectValue>{getConfigScopeLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        <SelectGroup>
          <SelectItem value="global">Global configuration</SelectItem>
          <SelectItem value="project">Project configuration</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function getConfigScopeLabel(scope: AgentCapabilityConfigScope): string {
  if (scope === "project") {
    return "Project configuration";
  }

  return "Global configuration";
}
