import type { ComponentProps } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@renderer/lib/utils'

const headingVariants = cva('text-foreground', {
  variants: {
    level: {
      h1: 'text-2xl font-semibold tracking-tight',
      h2: 'text-xl font-medium tracking-tight',
      h3: 'text-base font-medium',
      h4: 'text-sm font-medium',
      h5: 'text-xs font-medium uppercase tracking-wide text-muted-foreground',
      h6: 'text-[11px] font-medium uppercase tracking-wide text-muted-foreground'
    }
  },
  defaultVariants: {
    level: 'h2'
  }
})

type HeadingProps = ComponentProps<'h1'> & VariantProps<typeof headingVariants> & {
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
}

function Heading({ as, level, className, ...props }: HeadingProps): React.JSX.Element {
  const Component = as ?? level ?? 'h2'

  return <Component className={cn(headingVariants({ level }), className)} {...props} />
}

const textVariants = cva('', {
  variants: {
    variant: {
      body: 'text-sm text-foreground',
      muted: 'text-sm text-muted-foreground',
      small: 'text-xs text-foreground',
      subtle: 'text-xs text-muted-foreground',
      label: 'text-xs font-medium text-foreground',
      meta: 'text-[11px] text-muted-foreground',
      danger: 'text-sm text-destructive'
    }
  },
  defaultVariants: {
    variant: 'body'
  }
})

type TextProps = ComponentProps<'p'> & VariantProps<typeof textVariants> & {
  as?: 'p' | 'span' | 'div'
}

function Text({ as: Component = 'p', variant, className, ...props }: TextProps): React.JSX.Element {
  return <Component className={cn(textVariants({ variant }), className)} {...props} />
}

function CodeText({ className, ...props }: ComponentProps<'code'>): React.JSX.Element {
  return (
    <code
      className={cn('rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground', className)}
      {...props}
    />
  )
}

function Kbd({ className, ...props }: ComponentProps<'kbd'>): React.JSX.Element {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-mono text-[11px] text-muted-foreground',
        className
      )}
      {...props}
    />
  )
}

export { CodeText, Heading, Kbd, Text, headingVariants, textVariants }
