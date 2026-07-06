import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/settings')({
  component: SettingsPage
})

function SettingsPage(): React.JSX.Element {
  return (
    <div className="flex h-screen min-h-screen flex-col bg-background text-foreground">
      <header className="app-titlebar grid h-12 grid-cols-[1fr_auto_1fr] items-center border-b border-border bg-background px-3">
        <div className="flex items-center justify-start">
          <div className="mac-traffic-light-space shrink-0" />
        </div>
        <div className="text-sm font-medium text-muted-foreground">Space Zero</div>
        <nav className="titlebar-control flex items-center justify-end" aria-label="Settings navigation">
          <Link className="text-sm text-muted-foreground hover:text-foreground" to="/">
            Back to Workspace
          </Link>
        </nav>
      </header>

      <main aria-label="Settings" className="min-h-0 flex-1 bg-background p-6">
        <div className="mx-auto max-w-3xl space-y-3">
          <h1 className="text-xl font-medium">Settings</h1>
          <p className="text-sm text-muted-foreground">Configure Space Zero preferences here.</p>
        </div>
      </main>
    </div>
  )
}
