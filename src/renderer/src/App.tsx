import { useEffect, useState } from 'react'
import {
  CaretDown,
  CaretLeft,
  CaretRight,
  Columns,
  Database,
  GitBranch,
  MagnifyingGlass,
  Robot,
  Sidebar,
  SquaresFour,
  TerminalWindow
} from '@phosphor-icons/react'

import { Button } from './components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card'
import type { AppInfo, DbHealth } from '../../shared/ipc'

type HealthState = {
  app?: AppInfo
  db?: DbHealth
  error?: string
}

export function App(): React.JSX.Element {
  const [health, setHealth] = useState<HealthState>({})

  useEffect(() => {
    let cancelled = false

    async function loadHealth(): Promise<void> {
      try {
        const [app, db] = await Promise.all([window.spacezero.app.getInfo(), window.spacezero.db.health()])
        if (!cancelled) setHealth({ app, db })
      } catch (error) {
        if (!cancelled) {
          setHealth({ error: error instanceof Error ? error.message : 'Unknown IPC error' })
        }
      }
    }

    void loadHealth()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="app-titlebar flex h-12 items-center gap-2 border-b border-border bg-background/95 px-3">
        <div className="mac-traffic-light-space shrink-0" />

        <div className="titlebar-control flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Back">
            <CaretLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Forward">
            <CaretRight className="h-4 w-4" />
          </Button>
        </div>

        <button className="titlebar-control flex h-7 min-w-44 items-center gap-2 rounded-md border border-border bg-card px-3 text-left text-xs text-muted-foreground hover:bg-muted">
          <span className="font-medium text-foreground">Space Zero</span>
          <CaretDown className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
        </button>

        <div className="titlebar-control mx-auto flex h-8 w-full max-w-2xl items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground shadow-inner">
          <MagnifyingGlass className="h-4 w-4" />
          <span>Search projects, sessions, files, commands…</span>
        </div>

        <div className="titlebar-control ml-auto flex items-center gap-1 border-l border-border pl-2">
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Toggle sidebar">
            <Sidebar className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Layout">
            <Columns className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-3rem)] grid-cols-[280px_1fr]">
        <aside className="border-r border-border bg-background/95 p-5">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground">
              S0
            </div>
            <div>
              <h1 className="text-lg font-semibold">Space Zero</h1>
              <p className="text-xs text-muted-foreground">Agentic builder workspace</p>
            </div>
          </div>

          <nav className="space-y-1 text-sm text-muted-foreground">
            <a className="flex items-center gap-3 rounded-lg bg-muted px-3 py-2 text-foreground" href="#">
              <SquaresFour className="h-4 w-4" />
              Dashboard
            </a>
            <a className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted hover:text-foreground" href="#">
              <Robot className="h-4 w-4" />
              Agent Sessions
            </a>
            <a className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted hover:text-foreground" href="#">
              <GitBranch className="h-4 w-4" />
              Projects
            </a>
            <a className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted hover:text-foreground" href="#">
              <TerminalWindow className="h-4 w-4" />
              Terminal
            </a>
          </nav>
        </aside>

        <section className="p-8">
          <div className="mb-8 flex items-start justify-between gap-6">
            <div>
              <p className="mb-2 text-sm uppercase tracking-[0.25em] text-chart-1">Desktop foundation</p>
              <h2 className="text-4xl font-semibold tracking-tight">Zero-friction workspace for agentic development.</h2>
              <p className="mt-4 max-w-2xl text-muted-foreground">
                Electron, React, TypeScript, Vite, typed IPC, and SQLite are wired as the starting point for
                Space Zero.
              </p>
            </div>
            <Button>New Session</Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>IPC bridge</CardTitle>
                <CardDescription>Renderer asks the main process for app info.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Version</p>
                <p className="mt-1 font-mono text-lg" data-testid="ipc-version">
                  {health.app?.version ?? 'loading...'}
                </p>
                <p className="mt-4 text-sm text-muted-foreground">Platform</p>
                <p className="mt-1 font-mono text-sm">{health.app?.platform ?? 'loading...'}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-chart-1" /> SQLite
                </CardTitle>
                <CardDescription>Main-process database health check.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">Status</p>
                <p className="mt-1 font-mono text-lg" data-testid="db-health">
                  {health.db?.ok ? 'ready' : 'loading...'}
                </p>
                <p className="mt-4 break-all text-xs text-muted-foreground/80">{health.db?.path}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Next surfaces</CardTitle>
                <CardDescription>Planned app shell integrations.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li>• Project picker</li>
                  <li>• Pi agent sessions</li>
                  <li>• Monaco editor pane</li>
                  <li>• Terminal/session output</li>
                  <li>• Browser preview/debug surface</li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {health.error ? (
            <div className="mt-6 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {health.error}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}
