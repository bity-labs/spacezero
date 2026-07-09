import { Link } from '@tanstack/react-router'

import {
  SidebarMenuButton,
  SidebarMenuItem
} from '@renderer/components/ui/sidebar'
import { cn } from '@renderer/lib/utils'

type SidebarNavItemBaseProps = {
  icon: React.ComponentType<{ className?: string }>
  label: string
  active?: boolean
  className?: string
}

type SidebarNavButtonProps = SidebarNavItemBaseProps & {
  type?: 'button'
  onClick?: () => void
}

type SidebarNavLinkProps = SidebarNavItemBaseProps & {
  type: 'link'
  href: string
}

type SidebarNavRouteLinkProps = SidebarNavItemBaseProps & {
  type: 'route-link'
  to: '/' | '/settings'
}

type SidebarNavItemProps = SidebarNavButtonProps | SidebarNavLinkProps | SidebarNavRouteLinkProps

function SidebarNavItem(props: SidebarNavItemProps): React.JSX.Element {
  const { icon: Icon, label, active = false, className } = props
  const content = (
    <>
      <Icon className="h-4 w-4" aria-hidden="true" />
      <span>{label}</span>
    </>
  )

  if (props.type === 'link') {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton render={<a href={props.href} />} isActive={active} className={cn('text-muted-foreground', className)}>
          {content}
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  if (props.type === 'route-link') {
    return (
      <SidebarMenuItem>
        <SidebarMenuButton render={<Link to={props.to} />} isActive={active} className={cn('text-muted-foreground', className)}>
          {content}
        </SidebarMenuButton>
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton type="button" onClick={props.onClick} isActive={active} className={cn('text-muted-foreground', className)}>
        {content}
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export { SidebarNavItem }
