import { CaretRight } from '@phosphor-icons/react'
import type { ComponentProps } from 'react'

import { cn } from '@renderer/lib/utils'

function Breadcrumb({ ...props }: ComponentProps<'nav'>) {
  return <nav aria-label="breadcrumb" data-slot="breadcrumb" {...props} />
}

function BreadcrumbList({ className, ...props }: ComponentProps<'ol'>) {
  return (
    <ol
      className={cn(
        'flex flex-wrap items-center gap-1.5 break-words text-sm text-muted-foreground',
        className
      )}
      data-slot="breadcrumb-list"
      {...props}
    />
  )
}

function BreadcrumbItem({ className, ...props }: ComponentProps<'li'>) {
  return (
    <li
      className={cn('inline-flex items-center gap-1.5', className)}
      data-slot="breadcrumb-item"
      {...props}
    />
  )
}

function BreadcrumbPage({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      aria-current="page"
      className={cn('font-normal text-foreground', className)}
      data-slot="breadcrumb-page"
      {...props}
    />
  )
}

function BreadcrumbSeparator({ children, className, ...props }: ComponentProps<'li'>) {
  return (
    <li
      aria-hidden="true"
      className={cn('[&>svg]:size-3.5', className)}
      data-slot="breadcrumb-separator"
      role="presentation"
      {...props}
    >
      {children ?? <CaretRight aria-hidden="true" />}
    </li>
  )
}

export { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator }
