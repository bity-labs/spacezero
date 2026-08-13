import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { StorybookConfig } from '@storybook/react-vite'
import { mergeConfig } from 'vite'

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  framework: '@storybook/react-vite',
  viteFinal: async (viteConfig) =>
    mergeConfig(viteConfig, {
      plugins: [react(), tailwindcss()],
      resolve: {
        alias: {
          '@renderer': resolve(rootDirectory, 'src/renderer/src'),
          '@shared': resolve(rootDirectory, 'src/shared')
        }
      }
    })
}

export default config
