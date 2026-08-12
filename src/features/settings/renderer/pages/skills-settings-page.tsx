import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { AgentGlobalSkill } from '../../../agent-workspace/shared/agent-skill.model'
import { Badge } from '@renderer/components/ui/badge'
import { Input } from '@renderer/components/ui/input'
import { Switch } from '@renderer/components/ui/switch'
import { SettingsSection } from '../components/settings-section'

export function SkillsSettingsPage(): React.JSX.Element {
  const { t } = useTranslation()
  const [skills, setSkills] = useState<AgentGlobalSkill[] | null>(null)
  const [error, setError] = useState(false)
  const [pendingPath, setPendingPath] = useState<string | null>(null)
  const [skillSearchQuery, setSkillSearchQuery] = useState('')
  const updatePendingRef = useRef(false)
  const filteredSkills = useMemo(() => {
    if (skills === null) return null

    const normalizedQuery = skillSearchQuery.trim().toLocaleLowerCase()
    if (!normalizedQuery) return skills

    return skills.filter((skill) => skill.name.toLocaleLowerCase().includes(normalizedQuery))
  }, [skillSearchQuery, skills])

  useEffect(() => {
    let isCurrent = true

    window.spacezero.agent
      .getGlobalSkills()
      .then((globalSkills) => {
        if (!isCurrent) return
        setSkills(globalSkills)
      })
      .catch(() => {
        if (!isCurrent) return
        setError(true)
      })

    return () => {
      isCurrent = false
    }
  }, [])

  async function handleSkillEnabledChange(
    skill: AgentGlobalSkill,
    enabled: boolean
  ): Promise<void> {
    if (updatePendingRef.current) return

    updatePendingRef.current = true
    setPendingPath(skill.path)
    setError(false)

    try {
      const nextSkills = await window.spacezero.agent.setGlobalSkillEnabled({
        path: skill.path,
        enabled
      })
      setSkills(nextSkills)
    } catch {
      setError(true)
    } finally {
      updatePendingRef.current = false
      setPendingPath(null)
    }
  }

  return (
    <>
      <h2 className="mb-6 text-xl font-medium">{t('settings.navigation.skills')}</h2>
      <div className="space-y-8">
        <SettingsSection
          title={t('settings.skills.sectionTitle')}
          description={t('settings.skills.description')}
          footer={
            <p className="text-xs text-orange-600 dark:text-orange-400">
              {t('settings.skills.applyNote')}
            </p>
          }
        >
          {skills === null ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">
              {t('settings.skills.loading')}
            </p>
          ) : skills.length === 0 ? (
            <p className="px-4 pb-4 text-sm text-muted-foreground">{t('settings.skills.empty')}</p>
          ) : (
            <>
              <div className="px-4 py-4">
                <Input
                  type="search"
                  value={skillSearchQuery}
                  aria-label={t('settings.skills.searchLabel')}
                  placeholder={t('settings.skills.searchPlaceholder')}
                  onChange={(event) => setSkillSearchQuery(event.target.value)}
                />
              </div>
              {filteredSkills?.length === 0 ? (
                <p className="border-t border-border/70 px-4 py-4 text-sm text-muted-foreground">
                  {t('settings.skills.noSearchResults')}
                </p>
              ) : (
                filteredSkills?.map((skill) => (
                  <div
                    key={skill.path}
                    className="flex items-center gap-4 border-t border-border/70 px-4 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium">{skill.name}</p>
                        <Badge variant="secondary" className="shrink-0 text-[10px] uppercase">
                          {skill.scope}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{skill.description}</p>
                      <p
                        className="mt-2 truncate text-[11px] text-muted-foreground"
                        title={skill.path}
                      >
                        {t('settings.skills.path', { path: skill.path })}
                      </p>
                    </div>
                    <Switch
                      checked={skill.enabled}
                      disabled={pendingPath !== null}
                      aria-label={t(
                        skill.enabled ? 'settings.skills.disable' : 'settings.skills.enable',
                        { name: skill.name }
                      )}
                      onCheckedChange={(enabled) => void handleSkillEnabledChange(skill, enabled)}
                    />
                  </div>
                ))
              )}
            </>
          )}
          {error ? (
            <p className="px-4 pb-4 text-sm text-destructive">{t('settings.skills.error')}</p>
          ) : null}
        </SettingsSection>
      </div>
    </>
  )
}
