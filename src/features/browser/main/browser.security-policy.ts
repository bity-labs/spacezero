export type BrowserPermissionDecision = 'allow' | 'deny'

export type BrowserPermissionPromptRequest = {
  origin: string
  capability: string
}

export type BrowserCertificatePromptRequest = {
  origin: string
  url: string
  error: string
}

export type BrowserPermissionPrompt = (
  request: BrowserPermissionPromptRequest
) => Promise<BrowserPermissionDecision>

export type BrowserCertificatePrompt = (
  request: BrowserCertificatePromptRequest
) => Promise<'proceed' | 'cancel'>

const SUPPORTED_PERMISSION_CAPABILITIES = new Set([
  'camera',
  'microphone',
  'camera+microphone',
  'location',
  'notifications',
  'clipboard-read',
  'clipboard-write',
  'midi',
  'midi-sysex'
])

const EXACT_LOOPBACK_CERTIFICATE_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

export class BrowserSecurityPolicy {
  private readonly permissionGrants = new Set<string>()
  private readonly certificateExceptions = new Set<string>()

  constructor(
    private readonly permissionPrompt: BrowserPermissionPrompt,
    private readonly certificatePrompt: BrowserCertificatePrompt
  ) {}

  async requestPermission(request: {
    requestingUrl?: string
    permission: string
    details?: { mediaTypes?: string[] }
    isBackground?: boolean
  }): Promise<boolean> {
    if (request.isBackground) return false
    const origin = safeOrigin(request.requestingUrl)
    if (!origin) return false
    const capability = permissionCapability(request.permission, request.details)
    if (!capability || !SUPPORTED_PERMISSION_CAPABILITIES.has(capability)) return false

    const key = scopedDecisionKey(origin, capability)
    if (this.permissionGrants.has(key)) return true

    const decision = await this.permissionPrompt({ origin, capability })
    if (decision !== 'allow') return false
    this.permissionGrants.add(key)
    return true
  }

  async requestCertificateException(request: { url: string; error: string }): Promise<boolean> {
    const parsed = safeUrl(request.url)
    if (!parsed) return false
    if (!isExactLoopbackCertificateHost(parsed.hostname)) return false

    const origin = parsed.origin
    const key = scopedDecisionKey(origin, request.error)
    if (this.certificateExceptions.has(key)) return true

    const decision = await this.certificatePrompt({ origin, url: parsed.toString(), error: request.error })
    if (decision !== 'proceed') return false
    this.certificateExceptions.add(key)
    return true
  }

  resetTemporaryDecisions(): void {
    this.permissionGrants.clear()
    this.certificateExceptions.clear()
  }
}

export function permissionCapability(
  permission: string,
  details?: { mediaTypes?: string[] }
): string | null {
  switch (permission) {
    case 'media': {
      const mediaTypes = new Set(details?.mediaTypes ?? [])
      if (mediaTypes.size === 0) return null
      if ([...mediaTypes].some((type) => type !== 'audio' && type !== 'video')) return null
      if (mediaTypes.has('video') && mediaTypes.has('audio')) return 'camera+microphone'
      if (mediaTypes.has('video')) return 'camera'
      if (mediaTypes.has('audio')) return 'microphone'
      return null
    }
    case 'geolocation':
      return 'location'
    case 'notifications':
      return 'notifications'
    case 'clipboard-read':
      return 'clipboard-read'
    case 'clipboard-sanitized-write':
      return 'clipboard-write'
    case 'midi':
      return 'midi'
    case 'midiSysex':
      return 'midi-sysex'
    default:
      return null
  }
}

export function isExactLoopbackCertificateHost(hostname: string): boolean {
  return EXACT_LOOPBACK_CERTIFICATE_HOSTS.has(hostname.toLowerCase())
}

function scopedDecisionKey(origin: string, capability: string): string {
  return `${origin}\u0000${capability}`
}

function safeOrigin(input: string | undefined): string | null {
  const url = safeUrl(input)
  if (!url || (url.protocol !== 'http:' && url.protocol !== 'https:')) return null
  return url.origin
}

function safeUrl(input: string | undefined): URL | null {
  if (!input) return null
  try {
    return new URL(input)
  } catch {
    return null
  }
}
