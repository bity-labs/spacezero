export function AgentResourceTrustCheckbox({
  checked,
  disabled = false,
  onCheckedChange
}: {
  checked: boolean
  disabled?: boolean
  onCheckedChange: (checked: boolean) => void
}): React.JSX.Element {
  return (
    <label className="flex items-start gap-3 rounded-md border bg-muted/30 p-3 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onCheckedChange(event.currentTarget.checked)}
      />
      <span>
        <span className="block font-medium">Trust project agent resources</span>
        <span className="mt-1 block text-xs text-muted-foreground">
          Trusted Agent Definitions and skills from this Project may influence agents running in
          the Project. Leave this off unless you trust the repository contents.
        </span>
      </span>
    </label>
  )
}
