import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: RootRoute
})

function RootRoute(): React.JSX.Element {
  return <Outlet />
}
