import { useEffect, useMemo, useState } from 'react'
import { FolderOpen, WarningCircle } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import type {
  AgentDefinitionCatalogEntry,
  AgentDefinitionScope,
  OpenAgentDefinitionsFolderScope
} from '../../shared'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Card } from '@renderer/components/ui/card'
import { SettingsSection } from '../../../settings/renderer/components/settings-section'

const GLOBAL_DEFINITION_SCOPES: AgentDefinitionScope[] = ['spacezero', 'user', 'bundled']

export function AgentsSettingsSection(): React.JSX.Element {
  const { t } = useTranslation()
  const [definitions, setDefinitions] = useState<AgentDefinitionCatalogEntry[] | null>(null)
  const [error, setError] = useState(false)
  const [pendingOpenScope, setPendingOpenScope] = useState<OpenAgentDefinitionsFolderScope | null>(
    null
  )

  async function loadDefinitions(): Promise<void> {
    setError(false)

    try {
      setDefinitions(await window.spacezero.agents.getGlobalDefinitions())
    } catch {
      setError(true)
    }
  }

  useEffect(() => {
    let isCurrent = true

    window.spacezero.agents
      .getGlobalDefinitions()
      .then((globalDefinitions) => {
        if (!isCurrent) return
        setDefinitions(globalDefinitions)
      })
      .catch(() => {
        if (!isCurrent) return
        setError(true)
      })

    return () => {
      isCurrent = false
    }
  }, [])

  const definitionsByScope = useMemo(
    () => groupDefinitionsByScope(definitions ?? []),
    [definitions]
  )

  async function handleOpenFolder(scope: OpenAgentDefinitionsFolderScope): Promise<void> {
    setPendingOpenScope(scope)
    setError(false)

    try {
      await window.spacezero.agents.openDefinitionsFolder({ scope })
    } catch {
      setError(true)
    } finally {
      setPendingOpenScope(null)
    }
  }

  return (
    <>
      <h2 className="mb-6 text-xl font-medium">{t('settings.navigation.agents')}</h2>
      <div className="space-y-8">
        <SettingsSection
          title={t('settings.agents.sectionTitle')}
          description={t('settings.agents.description')}
          footer={
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{t('settings.agents.globalOnlyNote')}</p>
              <Button variant="outline" size="sm" onClick={() => void loadDefinitions()}>
                {t('settings.agents.rescan')}
              </Button>
            </div>
          }
        >
          {definitions === null ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              {t('settings.agents.loading')}
            </p>
          ) : definitions.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">{t('settings.agents.empty')}</p>
          ) : (
            <div className="space-y-5 border-t border-border/70 px-4 py-4">
              {GLOBAL_DEFINITION_SCOPES.map((scope) => (
                <AgentDefinitionScopeGroup
                  key={scope}
                  scope={scope}
                  definitions={definitionsByScope[scope] ?? []}
                  pendingOpenScope={pendingOpenScope}
                  onOpenFolder={handleOpenFolder}
                />
              ))}
            </div>
          )}
          {error ? (
            <p className="px-4 pb-4 text-sm text-destructive">{t('settings.agents.error')}</p>
          ) : null}
        </SettingsSection>
      </div>
    </>
  )
}

type AgentDefinitionScopeGroupProps = {
  scope: AgentDefinitionScope
  definitions: AgentDefinitionCatalogEntry[]
  pendingOpenScope: OpenAgentDefinitionsFolderScope | null
  onOpenFolder: (scope: OpenAgentDefinitionsFolderScope) => Promise<void>
}

function AgentDefinitionScopeGroup({
  scope,
  definitions,
  pendingOpenScope,
  onOpenFolder
}: AgentDefinitionScopeGroupProps): React.JSX.Element {
  const { t } = useTranslation()
  const canOpenFolder = scope === 'spacezero' || scope === 'user'

  return (
    <section aria-labelledby={`agent-definitions-${scope}-heading`} className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 id={`agent-definitions-${scope}-heading`} className="text-sm font-medium">
            {t(`settings.agents.scopes.${scope}`)}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(`settings.agents.scopeDescriptions.${scope}`)}
          </p>
        </div>
        {canOpenFolder ? (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-2"
            disabled={pendingOpenScope !== null}
            onClick={() => void onOpenFolder(scope)}
          >
            <FolderOpen className="h-4 w-4" aria-hidden="true" />
            {pendingOpenScope === scope
              ? t('settings.agents.openingFolder')
              : t('settings.agents.openFolder')}
          </Button>
        ) : null}
      </div>

      {definitions.length === 0 ? (
        <Card className="px-4 py-5 text-sm text-muted-foreground">
          {t('settings.agents.emptyScope')}
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          {definitions.map((definition) => (
            <AgentDefinitionRow
              key={`${definition.scope}-${definition.path}`}
              definition={definition}
            />
          ))}
        </Card>
      )}
    </section>
  )
}

function AgentDefinitionRow({
  definition
}: {
  definition: AgentDefinitionCatalogEntry
}): React.JSX.Element {
  const { t } = useTranslation()
  const isInvalid = definition.status === 'invalid'
  const isShadowed = Boolean(definition.shadowedBy)

  return (
    <div
      className={`border-b border-border/70 px-4 py-4 last:border-b-0 ${
        isShadowed ? 'opacity-55' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">{definition.name ?? definition.id}</p>
            <Badge variant="secondary" className="shrink-0 text-[10px] uppercase">
              {definition.id}
            </Badge>
            {isInvalid ? <Badge variant="destructive">{t('settings.agents.invalid')}</Badge> : null}
            {isShadowed ? (
              <Badge variant="outline">
                {t('settings.agents.shadowedBy', { scope: definition.shadowedBy })}
              </Badge>
            ) : null}
          </div>
          {definition.description ? (
            <p className="mt-1 text-xs text-muted-foreground">{definition.description}</p>
          ) : null}
          <p className="mt-2 truncate text-[11px] text-muted-foreground" title={definition.path}>
            {t('settings.agents.path', { path: definition.path })}
          </p>
        </div>
      </div>

      {definition.diagnostics.length > 0 ? (
        <ul className="mt-3 space-y-1">
          {definition.diagnostics.map((diagnostic) => (
            <li
              key={`${definition.path}-${diagnostic.code}-${diagnostic.message}`}
              className={
                diagnostic.severity === 'error'
                  ? 'flex items-start gap-2 text-xs text-destructive'
                  : 'flex items-start gap-2 text-xs text-orange-600 dark:text-orange-400'
              }
            >
              <WarningCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{diagnostic.message}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

function groupDefinitionsByScope(
  definitions: AgentDefinitionCatalogEntry[]
): Partial<Record<AgentDefinitionScope, AgentDefinitionCatalogEntry[]>> {
  return definitions.reduce<Partial<Record<AgentDefinitionScope, AgentDefinitionCatalogEntry[]>>>(
    (groups, definition) => {
      groups[definition.scope] = [...(groups[definition.scope] ?? []), definition]
      return groups
    },
    {}
  )
}
