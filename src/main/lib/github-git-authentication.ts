import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export type GitHubGitAuthenticationContext = {
  authenticatedEnvironment: NodeJS.ProcessEnv
  isolatedEnvironment: NodeJS.ProcessEnv
  configArgs: string[]
  templateDirectory: string
}

export async function withGitHubGitAuthentication<T>(
  accessToken: string,
  operation: (context: GitHubGitAuthenticationContext) => Promise<T>
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'spacezero-github-git-'))
  const askPassPath = join(directory, process.platform === 'win32' ? 'askpass.cmd' : 'askpass.sh')
  const globalConfigPath = join(directory, 'global.gitconfig')
  const hooksDirectory = join(directory, 'hooks')
  const templateDirectory = join(directory, 'template')

  await Promise.all([
    writeFile(askPassPath, createAskPassScript(), { mode: 0o700, flag: 'wx' }),
    writeFile(globalConfigPath, '', { mode: 0o600, flag: 'wx' }),
    mkdir(hooksDirectory, { recursive: true }),
    mkdir(templateDirectory, { recursive: true })
  ])
  await chmod(askPassPath, 0o700)

  const isolatedEnvironment = createIsolatedGitEnvironment(globalConfigPath)
  const configArgs = [
    '-c',
    'credential.helper=',
    '-c',
    `core.askPass=${askPassPath}`,
    '-c',
    `core.hooksPath=${hooksDirectory}`,
    '-c',
    'protocol.allow=never',
    '-c',
    'protocol.https.allow=always',
    '-c',
    'protocol.ext.allow=never',
    '-c',
    'fetch.recurseSubmodules=false',
    '-c',
    'submodule.recurse=false',
    '-c',
    'maintenance.auto=false',
    '-c',
    'gc.auto=0',
    '-c',
    'http.sslVerify=true',
    '-c',
    'http.followRedirects=false'
  ]

  try {
    return await operation({
      isolatedEnvironment,
      authenticatedEnvironment: {
        ...isolatedEnvironment,
        GIT_ASKPASS: askPassPath,
        SPACEZERO_GITHUB_TOKEN: accessToken
      },
      configArgs,
      templateDirectory
    })
  } finally {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined)
  }
}

function createIsolatedGitEnvironment(globalConfigPath: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {}
  for (const [key, value] of Object.entries(process.env)) {
    const normalizedKey = key.toUpperCase()
    if (normalizedKey.startsWith('GIT_') || normalizedKey === 'SPACEZERO_GITHUB_TOKEN') continue
    environment[key] = value
  }
  return {
    ...environment,
    GIT_CONFIG_GLOBAL: globalConfigPath,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_ATTR_NOSYSTEM: '1',
    GIT_ALLOW_PROTOCOL: 'https',
    GIT_PROTOCOL_FROM_USER: '0',
    GIT_TERMINAL_PROMPT: '0'
  }
}

function createAskPassScript(): string {
  if (process.platform === 'win32') {
    return [
      '@echo off',
      'setlocal',
      'set "prompt=%~1"',
      'echo(%prompt%|%SystemRoot%\\System32\\findstr.exe /B /L /C:"Username for \'https://github.com\':" /C:"Username for \'https://github.com/" >nul',
      'if not errorlevel 1 (echo x-access-token& exit /b 0)',
      'echo(%prompt%|%SystemRoot%\\System32\\findstr.exe /B /L /C:"Password for \'https://github.com\':" /C:"Password for \'https://github.com/" /C:"Password for \'https://x-access-token@github.com\':" /C:"Password for \'https://x-access-token@github.com/" >nul',
      'if not errorlevel 1 (echo %SPACEZERO_GITHUB_TOKEN%& exit /b 0)',
      'exit /b 1',
      ''
    ].join('\r\n')
  }

  return `#!/bin/sh
case "$1" in
  "Username for 'https://github.com': "|"Username for 'https://github.com/"*)
    printf '%s\\n' 'x-access-token'
    ;;
  "Password for 'https://github.com': "|"Password for 'https://github.com/"*|"Password for 'https://x-access-token@github.com': "|"Password for 'https://x-access-token@github.com/"*)
    printf '%s\\n' "$SPACEZERO_GITHUB_TOKEN"
    ;;
  *)
    exit 1
    ;;
esac
`
}
