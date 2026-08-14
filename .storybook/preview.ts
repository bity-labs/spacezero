import type { Preview } from '@storybook/react-vite'

import '../src/renderer/src/i18n'
import '../src/renderer/src/styles.css'
import { applyStorybookAppearance, STORYBOOK_FONTS, STORYBOOK_THEMES } from './appearance'

const preview: Preview = {
  globalTypes: {
    spacezeroTheme: {
      description: 'Space Zero theme',
      toolbar: {
        icon: 'paintbrush',
        items: STORYBOOK_THEMES.map((value) => ({
          value,
          title: value === 'dark-high-contrast' ? 'Dark high contrast' : capitalize(value)
        })),
        dynamicTitle: true
      }
    },
    spacezeroFont: {
      description: 'Space Zero font family',
      toolbar: {
        icon: 'paragraph',
        items: STORYBOOK_FONTS.map((value) => ({
          value,
          title: formatFontName(value)
        })),
        dynamicTitle: true
      }
    }
  },
  initialGlobals: {
    spacezeroTheme: 'dark',
    spacezeroFont: 'system'
  },
  decorators: [
    (Story, context) => {
      applyStorybookAppearance(
        document.documentElement,
        context.globals.spacezeroTheme,
        context.globals.spacezeroFont
      )
      return Story()
    }
  ],
  parameters: {
    layout: 'centered'
  }
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

function formatFontName(value: string): string {
  return value
    .split('-')
    .map((part) => capitalize(part))
    .join(' ')
}

export default preview
