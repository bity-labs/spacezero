import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Onboarding } from './onboarding'

const identity = {
  id: '42',
  login: 'octocat',
  avatarUrl: 'https://avatars.githubusercontent.com/u/42?v=4',
  profileUrl: 'https://github.com/octocat'
}

const repository = {
  id: '1000',
  nodeId: 'R_1000',
  installationId: '100',
  owner: 'bity-labs',
  name: 'spacezero',
  fullName: 'bity-labs/spacezero',
  isPrivate: true,
  defaultBranch: 'main',
  htmlUrl: 'https://github.com/bity-labs/spacezero',
  cloneUrl: 'https://github.com/bity-labs/spacezero.git'
}

describe('Onboarding repository setup', () => {
  it('orders onboarding as welcome, License Activation, GitHub connection, then Project setup', async () => {
    window.spacezero.licenseActivation.getStatus = async () => ({
      mode: 'required',
      state: 'inactive',
      canEnterWorkspace: false,
      message: 'Enter a license key to activate Space Zero.'
    })
    window.spacezero.licenseActivation.activate = async () => ({
      mode: 'required',
      state: 'active',
      canEnterWorkspace: true,
      message: 'Space Zero is activated.'
    })
    window.spacezero.github.getConnection = async () => ({
      status: 'connected',
      identity,
      installations: [],
      repositories: [repository]
    })

    render(<Onboarding onComplete={() => undefined} />)

    expect(screen.getByRole('heading', { name: 'Activate Space Zero' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
    expect(await screen.findByRole('heading', { name: 'License Activation' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('License key'), { target: { value: 'license-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(await screen.findByRole('heading', { name: 'Set up a GitHub Project?' })).toBeInTheDocument()
  })

  it('shows activation failure without completing onboarding', async () => {
    const onComplete = vi.fn()
    window.spacezero.licenseActivation.getStatus = async () => ({
      mode: 'required',
      state: 'inactive',
      canEnterWorkspace: false,
      message: 'Enter a license key to activate Space Zero.'
    })
    window.spacezero.licenseActivation.activate = async () => ({
      mode: 'required',
      state: 'invalid',
      canEnterWorkspace: false,
      message: 'This license key is invalid. Check the key and try again.'
    })

    render(<Onboarding onComplete={onComplete} />)

    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
    fireEvent.change(await screen.findByLabelText('License key'), { target: { value: 'bad-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))

    expect(await screen.findByText('This license key is invalid. Check the key and try again.')).toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('shows renewal/reactivation action for expired and revoked license statuses', async () => {
    const openUrlInDefaultBrowser = vi.fn(async () => undefined)
    window.spacezero.browser.openUrlInDefaultBrowser = openUrlInDefaultBrowser
    window.spacezero.licenseActivation.getStatus = async () => ({
      mode: 'required',
      state: 'expired',
      canEnterWorkspace: false,
      message: 'This license is expired. Renew or reactivate to continue.',
      renewalUrl: 'https://spacezero.dev/renew'
    })
    window.spacezero.licenseActivation.activate = async () => ({
      mode: 'required',
      state: 'revoked',
      canEnterWorkspace: false,
      message: 'This license was revoked. Reactivate with a valid license.',
      renewalUrl: 'https://spacezero.dev/reactivate'
    })

    render(<Onboarding onComplete={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
    const renewButton = await screen.findByRole('button', { name: 'Renew or reactivate' })
    fireEvent.click(renewButton)
    expect(openUrlInDefaultBrowser).toHaveBeenCalledWith({ url: 'https://spacezero.dev/renew' })

    fireEvent.change(screen.getByLabelText('License key'), { target: { value: 'revoked-key' } })
    fireEvent.click(screen.getByRole('button', { name: 'Activate' }))
    expect(await screen.findByText('This license was revoked. Reactivate with a valid license.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Renew or reactivate' }))
    expect(openUrlInDefaultBrowser).toHaveBeenCalledWith({ url: 'https://spacezero.dev/reactivate' })
  })

  it('shows update action for unsupported builds while retaining license key retry', async () => {
    const openUrlInDefaultBrowser = vi.fn(async () => undefined)
    window.spacezero.browser.openUrlInDefaultBrowser = openUrlInDefaultBrowser
    window.spacezero.licenseActivation.getStatus = async () => ({
      mode: 'required',
      state: 'unsupported-version',
      canEnterWorkspace: false,
      message: 'This Space Zero build is no longer supported. Update to continue.',
      updateUrl: 'https://spacezero.dev/download'
    })

    render(<Onboarding onComplete={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
    expect(await screen.findByLabelText('License key')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Update Space Zero' }))

    expect(openUrlInDefaultBrowser).toHaveBeenCalledWith({ url: 'https://spacezero.dev/download' })
    expect(screen.getByRole('button', { name: 'Activate' })).toBeInTheDocument()
  })

  it('lets development bypass continue into GitHub connection', async () => {
    window.spacezero.licenseActivation.getStatus = async () => ({
      mode: 'development-bypass',
      state: 'active',
      canEnterWorkspace: true,
      message: 'Development build activation bypass is enabled.'
    })
    window.spacezero.github.getConnection = async () => ({ status: 'disconnected' })

    render(<Onboarding onComplete={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
    expect(await screen.findByRole('heading', { name: 'Connect GitHub' })).toBeInTheDocument()
  })

  it('does not finish onboarding while a managed clone is active', async () => {
    window.spacezero.github.getConnection = async () => ({
      status: 'connected',
      identity,
      installations: [],
      repositories: [repository]
    })
    window.spacezero.github.listRepositorySetupOptions = async () => [{ repository }]
    window.spacezero.github.onCloneProgress = () => () => undefined
    window.spacezero.github.startClone = async () => ({
      status: 'started',
      operationId: 'clone-1'
    })

    render(<Onboarding onComplete={() => undefined} />)

    fireEvent.click(screen.getByRole('button', { name: 'Get started' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Set up a Project' }))
    fireEvent.click(await screen.findByRole('radio', { name: /bity-labs\/spacezero/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Clone repository' }))

    await screen.findByText('Preparing managed clone…')
    expect(screen.getByRole('button', { name: 'Continue without a Project' })).toBeDisabled()
  })
})
