import { describe, expect, it, vi } from 'vitest'

import { BrowserSecurityPolicy, isExactLoopbackCertificateHost } from './browser.security-policy'

describe('BrowserSecurityPolicy permissions', () => {
  it('prompts per origin and capability, then reuses only the exact in-memory grant', async () => {
    const prompt = vi.fn().mockResolvedValue('allow')
    const policy = new BrowserSecurityPolicy(prompt, vi.fn())

    await expect(
      policy.requestPermission({
        requestingUrl: 'https://example.com/camera',
        permission: 'media',
        details: { mediaTypes: ['video'] }
      })
    ).resolves.toBe(true)
    await expect(
      policy.requestPermission({
        requestingUrl: 'https://example.com/other',
        permission: 'media',
        details: { mediaTypes: ['video'] }
      })
    ).resolves.toBe(true)
    await expect(
      policy.requestPermission({
        requestingUrl: 'https://example.com',
        permission: 'geolocation'
      })
    ).resolves.toBe(true)
    await expect(
      policy.requestPermission({
        requestingUrl: 'https://example.com',
        permission: 'media',
        details: { mediaTypes: ['audio', 'video'] }
      })
    ).resolves.toBe(true)
    await expect(
      policy.requestPermission({
        requestingUrl: 'https://other.example',
        permission: 'media',
        details: { mediaTypes: ['video'] }
      })
    ).resolves.toBe(true)

    expect(prompt).toHaveBeenCalledTimes(4)
    expect(prompt).toHaveBeenNthCalledWith(1, {
      origin: 'https://example.com',
      capability: 'camera'
    })
    expect(prompt).toHaveBeenNthCalledWith(2, {
      origin: 'https://example.com',
      capability: 'location'
    })
    expect(prompt).toHaveBeenNthCalledWith(3, {
      origin: 'https://example.com',
      capability: 'camera+microphone'
    })
    expect(prompt).toHaveBeenNthCalledWith(4, {
      origin: 'https://other.example',
      capability: 'camera'
    })
  })

  it('checks only exact prior in-memory grants without prompting', async () => {
    const prompt = vi.fn().mockResolvedValue('allow')
    const policy = new BrowserSecurityPolicy(prompt, vi.fn())

    expect(
      policy.checkPermission({ requestingUrl: 'https://example.com', permission: 'notifications' })
    ).toBe(false)
    await policy.requestPermission({ requestingUrl: 'https://example.com/path', permission: 'notifications' })
    expect(
      policy.checkPermission({ requestingUrl: 'https://example.com/other', permission: 'notifications' })
    ).toBe(true)
    expect(
      policy.checkPermission({ requestingUrl: 'https://example.com', permission: 'geolocation' })
    ).toBe(false)
    expect(
      policy.checkPermission({ requestingUrl: 'https://other.example', permission: 'notifications' })
    ).toBe(false)
    expect(
      policy.checkPermission({
        requestingUrl: 'https://example.com',
        permission: 'notifications',
        isBackground: true
      })
    ).toBe(false)
    expect(policy.checkPermission({ requestingUrl: 'not a url', permission: 'notifications' })).toBe(false)

    expect(prompt).toHaveBeenCalledTimes(1)
  })

  it('expires permission grants when temporary decisions are reset', async () => {
    const prompt = vi.fn().mockResolvedValue('allow')
    const policy = new BrowserSecurityPolicy(prompt, vi.fn())

    await policy.requestPermission({
      requestingUrl: 'https://example.com',
      permission: 'notifications'
    })
    policy.resetTemporaryDecisions()
    await policy.requestPermission({
      requestingUrl: 'https://example.com',
      permission: 'notifications'
    })

    expect(prompt).toHaveBeenCalledTimes(2)
  })

  it('fails closed for denied, unsupported, malformed, and background permission requests', async () => {
    const prompt = vi.fn().mockResolvedValue('deny')
    const policy = new BrowserSecurityPolicy(prompt, vi.fn())

    await expect(
      policy.requestPermission({ requestingUrl: 'https://example.com', permission: 'notifications' })
    ).resolves.toBe(false)
    await expect(
      policy.requestPermission({ requestingUrl: 'https://example.com', permission: 'unknown' })
    ).resolves.toBe(false)
    await expect(
      policy.requestPermission({ requestingUrl: 'not a url', permission: 'notifications' })
    ).resolves.toBe(false)
    await expect(
      policy.requestPermission({
        requestingUrl: 'https://example.com',
        permission: 'media',
        details: { mediaTypes: ['screen'] }
      })
    ).resolves.toBe(false)
    await expect(
      policy.requestPermission({
        requestingUrl: 'https://example.com',
        permission: 'geolocation',
        isBackground: true
      })
    ).resolves.toBe(false)

    expect(prompt).toHaveBeenCalledTimes(1)
  })
})

describe('BrowserSecurityPolicy certificates', () => {
  it('allows temporary exceptions only for exact loopback hosts', async () => {
    const prompt = vi.fn().mockResolvedValue('proceed')
    const policy = new BrowserSecurityPolicy(vi.fn(), prompt)

    await expect(
      policy.requestCertificateException({ url: 'https://localhost:3443/app', error: 'net::ERR_CERT_AUTHORITY_INVALID' })
    ).resolves.toBe(true)
    await expect(
      policy.requestCertificateException({ url: 'https://localhost:3443/other', error: 'net::ERR_CERT_AUTHORITY_INVALID' })
    ).resolves.toBe(true)
    await expect(
      policy.requestCertificateException({ url: 'https://127.0.0.1:3443/', error: 'net::ERR_CERT_AUTHORITY_INVALID' })
    ).resolves.toBe(true)
    await expect(
      policy.requestCertificateException({ url: 'https://[::1]:3443/', error: 'net::ERR_CERT_AUTHORITY_INVALID' })
    ).resolves.toBe(true)

    expect(prompt).toHaveBeenCalledTimes(3)
    expect(prompt).toHaveBeenNthCalledWith(1, {
      origin: 'https://localhost:3443',
      url: 'https://localhost:3443/app',
      error: 'net::ERR_CERT_AUTHORITY_INVALID'
    })
  })

  it('blocks remote hosts, lookalike loopback hosts, malformed URLs, and cancellation', async () => {
    const prompt = vi.fn().mockResolvedValue('cancel')
    const policy = new BrowserSecurityPolicy(vi.fn(), prompt)

    await expect(
      policy.requestCertificateException({ url: 'https://localhost:3443/', error: 'bad cert' })
    ).resolves.toBe(false)
    await expect(
      policy.requestCertificateException({ url: 'https://example.com/', error: 'bad cert' })
    ).resolves.toBe(false)
    await expect(
      policy.requestCertificateException({ url: 'https://localhost.example.com/', error: 'bad cert' })
    ).resolves.toBe(false)
    await expect(
      policy.requestCertificateException({ url: 'https://127.1/', error: 'bad cert' })
    ).resolves.toBe(false)
    await expect(
      policy.requestCertificateException({ url: 'https://2130706433/', error: 'bad cert' })
    ).resolves.toBe(false)
    await expect(
      policy.requestCertificateException({ url: 'https://0x7f000001/', error: 'bad cert' })
    ).resolves.toBe(false)
    await expect(
      policy.requestCertificateException({ url: 'https://[0:0:0:0:0:0:0:1]/', error: 'bad cert' })
    ).resolves.toBe(false)
    await expect(
      policy.requestCertificateException({ url: 'not a url', error: 'bad cert' })
    ).resolves.toBe(false)

    expect(prompt).toHaveBeenCalledTimes(1)
  })

  it('expires certificate exceptions when temporary decisions are reset', async () => {
    const prompt = vi.fn().mockResolvedValue('proceed')
    const policy = new BrowserSecurityPolicy(vi.fn(), prompt)

    await policy.requestCertificateException({ url: 'https://localhost:3443/', error: 'bad cert' })
    policy.resetTemporaryDecisions()
    await policy.requestCertificateException({ url: 'https://localhost:3443/', error: 'bad cert' })

    expect(prompt).toHaveBeenCalledTimes(2)
  })

  it('matches only the accepted certificate loopback hostnames', () => {
    expect(isExactLoopbackCertificateHost('localhost')).toBe(true)
    expect(isExactLoopbackCertificateHost('127.0.0.1')).toBe(true)
    expect(isExactLoopbackCertificateHost('[::1]')).toBe(true)
    expect(isExactLoopbackCertificateHost('localhost.example.com')).toBe(false)
    expect(isExactLoopbackCertificateHost('127.0.0.2')).toBe(false)
  })
})
