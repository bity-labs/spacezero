import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { OnboardingGate } from './onboarding-gate'

describe('OnboardingGate', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('blocks a completed workspace immediately when activation is revoked', async () => {
    const openUrlInDefaultBrowser = vi.fn(async () => undefined)
    window.spacezero.browser.openUrlInDefaultBrowser = openUrlInDefaultBrowser
    window.spacezero.onboarding.getStatus = async () => ({ completed: true })
    window.spacezero.licenseActivation.getStatus = async () => ({
      mode: 'required',
      state: 'revoked',
      canEnterWorkspace: false,
      message: 'This license was revoked. Reactivate with a valid license.',
      renewalUrl: 'https://spacezero.dev/reactivate'
    })

    render(
      <OnboardingGate>
        <div>Workspace</div>
      </OnboardingGate>
    )

    expect(await screen.findByRole('heading', { name: 'License Activation' })).toBeInTheDocument()
    expect(screen.getByText('This license was revoked. Reactivate with a valid license.')).toBeInTheDocument()
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Renew or reactivate' }))
    expect(openUrlInDefaultBrowser).toHaveBeenCalledWith({ url: 'https://spacezero.dev/reactivate' })
  })

  it('rechecks activation while an already-open app crosses the recheck boundary', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    window.spacezero.onboarding.getStatus = async () => ({ completed: true })
    window.spacezero.licenseActivation.getStatus = vi
      .fn()
      .mockResolvedValueOnce({
        mode: 'required',
        state: 'active',
        canEnterWorkspace: true,
        message: 'Space Zero is activated.',
        recheckAfter: new Date(Date.now() + 10).toISOString()
      })
      .mockResolvedValueOnce({
        mode: 'required',
        state: 'revoked',
        canEnterWorkspace: false,
        message: 'This license was revoked. Reactivate with a valid license.',
        renewalUrl: 'https://spacezero.dev/reactivate'
      })

    render(
      <OnboardingGate>
        <div>Workspace</div>
      </OnboardingGate>
    )

    expect(await screen.findByText('Workspace')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    await waitFor(() => expect(window.spacezero.licenseActivation.getStatus).toHaveBeenCalledTimes(2))
    expect(await screen.findByRole('heading', { name: 'License Activation' })).toBeInTheDocument()
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument()
  })

  it('refreshes and schedules activation rechecks after first-run onboarding completes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const activeStatus = {
      mode: 'required' as const,
      state: 'active' as const,
      canEnterWorkspace: true,
      message: 'Space Zero is activated.',
      recheckAfter: new Date(Date.now() + 10).toISOString()
    }
    window.spacezero.onboarding.getStatus = vi
      .fn()
      .mockResolvedValueOnce({ completed: false })
      .mockResolvedValue({ completed: true })
    window.spacezero.onboarding.complete = async () => ({ completed: true })
    window.spacezero.licenseActivation.getStatus = vi
      .fn()
      .mockResolvedValueOnce(activeStatus)
      .mockResolvedValueOnce(activeStatus)
      .mockResolvedValueOnce(activeStatus)
      .mockResolvedValueOnce(activeStatus)
      .mockResolvedValueOnce({
        mode: 'required',
        state: 'unsupported-version',
        canEnterWorkspace: false,
        message: 'This Space Zero build is no longer supported. Update to continue.',
        updateUrl: 'https://spacezero.dev/download'
      })
    window.spacezero.github.getConnection = async () => ({
      status: 'connected',
      identity: {
        id: '42',
        login: 'octocat',
        avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
        profileUrl: 'https://github.com/octocat'
      },
      installations: [],
      repositories: []
    })

    render(
      <OnboardingGate>
        <div>Workspace</div>
      </OnboardingGate>
    )

    fireEvent.click(await screen.findByRole('button', { name: 'Get started' }))
    expect(await screen.findByRole('heading', { name: 'Set up a GitHub Project?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Skip Project setup' }))
    expect(await screen.findByText('Workspace')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    await waitFor(() => expect(window.spacezero.licenseActivation.getStatus).toHaveBeenCalledTimes(5))
    expect(await screen.findByRole('heading', { name: 'License Activation' })).toBeInTheDocument()
    expect(screen.getByText('This Space Zero build is no longer supported. Update to continue.')).toBeInTheDocument()
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument()
  })

  it('refreshes and schedules activation rechecks after reactivation completes', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    const activeStatus = {
      mode: 'required' as const,
      state: 'active' as const,
      canEnterWorkspace: true,
      message: 'Space Zero is activated.',
      recheckAfter: new Date(Date.now() + 10).toISOString()
    }
    window.spacezero.onboarding.getStatus = async () => ({ completed: true })
    window.spacezero.onboarding.complete = async () => ({ completed: true })
    window.spacezero.licenseActivation.getStatus = vi
      .fn()
      .mockResolvedValueOnce({
        mode: 'required',
        state: 'revoked',
        canEnterWorkspace: false,
        message: 'This license was revoked. Reactivate with a valid license.',
        renewalUrl: 'https://spacezero.dev/reactivate'
      })
      .mockResolvedValueOnce(activeStatus)
      .mockResolvedValueOnce({
        mode: 'required',
        state: 'revoked',
        canEnterWorkspace: false,
        message: 'This license was revoked again. Reactivate with a valid license.',
        renewalUrl: 'https://spacezero.dev/reactivate'
      })
    window.spacezero.licenseActivation.activate = async () => activeStatus
    window.spacezero.github.getConnection = async () => ({
      status: 'connected',
      identity: {
        id: '42',
        login: 'octocat',
        avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
        profileUrl: 'https://github.com/octocat'
      },
      installations: [],
      repositories: []
    })

    render(
      <OnboardingGate>
        <div>Workspace</div>
      </OnboardingGate>
    )

    expect(await screen.findByRole('heading', { name: 'License Activation' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('License key'), { target: { value: 'new-license-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(await screen.findByRole('heading', { name: 'Set up a GitHub Project?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Skip Project setup' }))
    expect(await screen.findByText('Workspace')).toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    await waitFor(() => expect(window.spacezero.licenseActivation.getStatus).toHaveBeenCalledTimes(3))
    expect(await screen.findByRole('heading', { name: 'License Activation' })).toBeInTheDocument()
    expect(screen.getByText('This license was revoked again. Reactivate with a valid license.')).toBeInTheDocument()
    expect(screen.queryByText('Workspace')).not.toBeInTheDocument()
  })
})
