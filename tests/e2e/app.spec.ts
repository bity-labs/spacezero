import { expect, test, _electron as electron } from '@playwright/test'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const electronPath = require('electron') as string

test('launches the Electron app shell', async () => {
  const electronApp = await electron.launch({
    executablePath: electronPath,
    args: [join(process.cwd(), 'out/main/index.js')]
  })

  const window = await electronApp.firstWindow()

  await expect(window.getByRole('heading', { name: 'Space Zero' })).toBeVisible()
  await expect(window.getByTestId('ipc-version')).not.toHaveText('loading...')
  await expect(window.getByTestId('db-health')).toHaveText('ready')

  await electronApp.close()
})
