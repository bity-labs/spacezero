import { useCallback, useEffect, useState } from 'react'

import type { CreateEmptyProjectRequest, Project, UpdateProjectRequest } from '../../shared'
import { consumeProjectOpenRequest } from '../project-open-request'

type ProjectStatus = 'loading' | 'ready' | 'error'

export function useProjects(): {
  projects: Project[]
  activeProject: Project | null
  status: ProjectStatus
  error: string | null
  warning: string | null
  refreshProjects: () => Promise<Project[]>
  selectProject: (project: Project) => void
  upsertProject: (project: Project) => void
  createEmptyProject: (request: CreateEmptyProjectRequest) => Promise<Project>
  addProjectFromFolder: () => Promise<Project | null>
  updateProject: (request: UpdateProjectRequest) => Promise<Project>
  archiveProject: (projectId: string) => Promise<void>
  deleteProject: (projectId: string) => Promise<void>
} {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [status, setStatus] = useState<ProjectStatus>('loading')
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)

  const refreshProjects = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const nextProjects = await window.spacezero.projects.list()
      setProjects(nextProjects)
      setActiveProjectId((currentId) =>
        currentId && nextProjects.some((project) => project.id === currentId) ? currentId : null
      )
      setStatus('ready')
      return nextProjects
    } catch {
      setError('Unable to load projects.')
      setStatus('error')
      throw new Error('Unable to load projects.')
    }
  }, [])

  useEffect(() => {
    let canceled = false

    async function loadProjects(): Promise<void> {
      try {
        const nextProjects = await window.spacezero.projects.list()
        if (canceled) return
        setProjects(nextProjects)
        const requestedProjectId = consumeProjectOpenRequest()
        if (
          requestedProjectId &&
          nextProjects.some((project) => project.id === requestedProjectId)
        ) {
          setActiveProjectId(requestedProjectId)
        }
        setStatus('ready')
      } catch {
        if (canceled) return
        setError('Unable to load projects.')
        setStatus('error')
      }
    }

    void loadProjects()

    return () => {
      canceled = true
    }
  }, [])

  const rememberProject = useCallback((project: Project) => {
    setProjects((currentProjects) => {
      const existingIndex = currentProjects.findIndex((item) => item.id === project.id)
      if (existingIndex === -1) return [...currentProjects, project]
      return currentProjects.map((item) => (item.id === project.id ? project : item))
    })
    setActiveProjectId(project.id)
  }, [])

  const createEmptyProject = useCallback(
    async (request: CreateEmptyProjectRequest) => {
      setWarning(null)
      const project = await window.spacezero.projects.createEmpty(request)
      setWarning(project.setupWarning ?? null)
      rememberProject(project)
      await refreshProjects()
      setActiveProjectId(project.id)
      return project
    },
    [refreshProjects, rememberProject]
  )

  const addProjectFromFolder = useCallback(async () => {
    setWarning(null)
    const project = await window.spacezero.projects.addFromFolder()
    if (project) {
      setWarning(project.setupWarning ?? null)
      rememberProject(project)
      await refreshProjects()
      setActiveProjectId(project.id)
    }
    return project
  }, [refreshProjects, rememberProject])

  const updateProject = useCallback(
    async (request: UpdateProjectRequest) => {
      const project = await window.spacezero.projects.update(request)
      rememberProject(project)
      await refreshProjects()
      setActiveProjectId(project.id)
      return project
    },
    [refreshProjects, rememberProject]
  )

  const removeProjectFromState = useCallback((projectId: string) => {
    setProjects((currentProjects) => currentProjects.filter((project) => project.id !== projectId))
    setActiveProjectId((currentId) => (currentId === projectId ? null : currentId))
  }, [])

  const archiveProject = useCallback(
    async (projectId: string) => {
      await window.spacezero.projects.archive({ projectId })
      removeProjectFromState(projectId)
    },
    [removeProjectFromState]
  )

  const deleteProject = useCallback(
    async (projectId: string) => {
      await window.spacezero.projects.delete({ projectId })
      removeProjectFromState(projectId)
    },
    [removeProjectFromState]
  )

  return {
    projects,
    activeProject: projects.find((project) => project.id === activeProjectId) ?? null,
    status,
    error,
    warning,
    refreshProjects,
    selectProject: (project) => setActiveProjectId(project.id),
    upsertProject: rememberProject,
    createEmptyProject,
    addProjectFromFolder,
    updateProject,
    archiveProject,
    deleteProject
  }
}
