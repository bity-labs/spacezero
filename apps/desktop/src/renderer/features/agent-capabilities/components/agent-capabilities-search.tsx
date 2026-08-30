import { Input } from "@spacezero/ui/components/input";
import type { ReactElement } from "react";

export type AgentCapabilitiesSearchProps = {
  label: string;
  placeholder: string;
};

export function AgentCapabilitiesSearch({
  label,
  placeholder,
}: AgentCapabilitiesSearchProps): ReactElement {
  return (
    <div className="flex min-h-[72px] items-center border-b border-border/70 px-4 py-4">
      <Input aria-label={label} placeholder={placeholder} className="h-9" />
    </div>
  );
}
