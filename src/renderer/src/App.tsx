import { useEffect, useState } from 'react'
import {
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Database,
  GitBranch,
  LayoutDashboard,
  PanelLeft,
  Search,
  TerminalSquare
} from 'lucide-react'

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
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="app-titlebar flex h-12 items-center gap-2 border-b border-slate-800 bg-slate-950/95 px-3">
        <div className="mac-traffic-light-space shrink-0" />

        <div className="titlebar-control flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400" aria-label="Back">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400" aria-label="Forward">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <button className="titlebar-control flex h-7 min-w-44 items-center gap-2 rounded-md border border-slate-800 bg-slate-900/80 px-3 text-left text-xs text-slate-300 hover:bg-slate-800">
          <span className="font-medium text-slate-100">Space Zero</span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 text-slate-500" />
        </button>

        <div className="titlebar-control mx-auto flex h-8 w-full max-w-2xl items-center gap-2 rounded-lg border border-slate-700/80 bg-slate-900/80 px-3 text-sm text-slate-400 shadow-inner">
          <Search className="h-4 w-4" />
          <span>Search projects, sessions, files, commands…</span>
        </div>

        <div className="titlebar-control ml-auto flex items-center gap-1 border-l border-slate-800 pl-2">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400" aria-label="Toggle sidebar">
            <PanelLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400" aria-label="Layout">
            <Columns3 className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-3rem)] grid-cols-[280px_1fr]">
        <aside className="border-r border-slate-800 bg-slate-950/95 p-5">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400 font-bold text-slate-950">
              S0
            </div>
            <div>
              <h1 className="text-lg font-semibold">Space Zero</h1>
              <p className="text-xs text-slate-400">Agentic builder workspace</p>
            </div>
          </div>

          <nav className="space-y-1 text-sm text-slate-300">
            <a className="flex items-center gap-3 rounded-lg bg-slate-900 px-3 py-2 text-slate-100" href="#">
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </a>
            <a className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-900" href="#">
              <Bot className="h-4 w-4" />
              Agent Sessions
            </a>
            <a className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-900" href="#">
              <GitBranch className="h-4 w-4" />
              Projects
            </a>
            <a className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-900" href="#">
              <TerminalSquare className="h-4 w-4" />
              Terminal
            </a>
          </nav>
        </aside>

        <section className="p-8">
          <div className="mb-8 flex items-start justify-between gap-6">
            <div>
              <p className="mb-2 text-sm uppercase tracking-[0.25em] text-sky-300">Desktop foundation</p>
              <h2 className="text-4xl font-semibold tracking-tight">Zero-friction workspace for agentic development.</h2>
              <p className="mt-4 max-w-2xl text-slate-400">
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
                <p className="text-sm text-slate-400">Version</p>
                <p className="mt-1 font-mono text-lg" data-testid="ipc-version">
                  {health.app?.version ?? 'loading...'}
                </p>
                <p className="mt-4 text-sm text-slate-400">Platform</p>
                <p className="mt-1 font-mono text-sm">{health.app?.platform ?? 'loading...'}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5 text-sky-300" /> SQLite
                </CardTitle>
                <CardDescription>Main-process database health check.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-400">Status</p>
                <p className="mt-1 font-mono text-lg" data-testid="db-health">
                  {health.db?.ok ? 'ready' : 'loading...'}
                </p>
                <p className="mt-4 break-all text-xs text-slate-500">{health.db?.path}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Next surfaces</CardTitle>
                <CardDescription>Planned app shell integrations.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-slate-300">
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
            <div className="mt-6 rounded-lg border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-200">
              {health.error}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}
