import * as React from "react"

import { cn } from "@renderer/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-14 w-full rounded-md border border-input bg-input/20 px-2 py-1.5 text-sm transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-muted-foreground/45 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/35",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
