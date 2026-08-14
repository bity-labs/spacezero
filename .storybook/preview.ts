import type { Preview } from '@storybook/react-vite'

import '../src/renderer/src/i18n'
import '../src/renderer/src/styles.css'
import './window-controls.css'
import {
  applyStorybookAppearance,
  STORYBOOK_FONTS,
  STORYBOOK_FONT_ANTIALIASING,
  STORYBOOK_THEMES,
  type StorybookFontAntialiasing
} from './appearance'
import type { FontFamilyPreference, ThemePreference } from '../src/shared/appearance-settings'

const FONT_FAMILY_LABELS: Record<FontFamilyPreference, string> = {
  system: 'System font',
  geist: 'Geist',
  'sf-pro': 'SF Pro Text',
  inter: 'Inter',
  helvetica: 'Helvetica Neue',
  arial: 'Arial',
  'sf-mono': 'SF Mono',
  menlo: 'Menlo',
  monaco: 'Monaco',
  'jetbrains-mono': 'JetBrains Mono',
  monospace: 'Generic monospace'
}

const THEME_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
  'dark-high-contrast': 'Dark high contrast'
}

const FONT_ANTIALIASING_LABELS: Record<StorybookFontAntialiasing, string> = {
  thin: 'Thin anti-aliased',
  native: 'Native'
}

const preview: Preview = {
  globalTypes: {
    themePreference: {
      name: 'App theme',
      description: 'Space Zero theme preference applied to the preview iframe and canvas background.',
      defaultValue: 'system',
      toolbar: {
        icon: 'circlehollow',
        dynamicTitle: true,
        items: STORYBOOK_THEMES.map((value) => ({ value, title: THEME_LABELS[value] }))
      }
    },
    fontFamily: {
      name: 'Font',
      description: 'Space Zero interface font alias applied to the preview iframe.',
      defaultValue: 'system',
      toolbar: {
        icon: 'paragraph',
        dynamicTitle: true,
        items: STORYBOOK_FONTS.map((value) => ({ value, title: FONT_FAMILY_LABELS[value] }))
      }
    },
    fontAntialiasing: {
      name: 'Font anti-aliasing',
      description: 'Space Zero font smoothing mode applied to the preview iframe.',
      defaultValue: 'thin',
      toolbar: {
        icon: 'contrast',
        dynamicTitle: true,
        items: STORYBOOK_FONT_ANTIALIASING.map((value) => ({
          value,
          title: FONT_ANTIALIASING_LABELS[value]
        }))
      }
    }
  },
  decorators: [
    (Story, context) => {
      document.body.classList.add('storybook-preview')
      applyStorybookAppearance({
        root: document.documentElement,
        body: document.body,
        themePreference: getThemePreference(context.globals.themePreference),
        fontFamily: getFontFamily(context.globals.fontFamily),
        fontAntialiasing: getFontAntialiasing(context.globals.fontAntialiasing),
        prefersDark: window.matchMedia('(prefers-color-scheme: dark)').matches
      })
      return Story()
    }
  ],
  parameters: {
    layout: 'centered',
    backgrounds: {
      disable: true
    },
    options: {
      storySort: {
        order: [
          'Design System',
          ['Primitives', 'Components', ['Agent Chat', 'App Shell']],
          'Features',
          [
            'Settings',
            ['Components', 'Layouts', 'Screens'],
            'Projects',
            ['Components', 'Layouts', 'Screens'],
            'GitHub',
            ['Components', 'Layouts', 'Screens'],
            'Files',
            ['Components', 'Layouts', 'Screens'],
            'Git',
            ['Components', 'Layouts', 'Screens'],
            'Browser',
            ['Components', 'Layouts', 'Screens'],
            'Terminal',
            ['Components', 'Layouts', 'Screens'],
            'Knowledge Base',
            ['Components', 'Layouts', 'Screens'],
            'Onboarding',
            ['Components', 'Layouts', 'Screens'],
            'Sessions',
            ['Components', 'Layouts', 'Screens']
          ],
          'Screens'
        ]
      }
    }
  }
}

function getThemePreference(value: unknown): ThemePreference {
  return STORYBOOK_THEMES.find((preference) => preference === value) ?? 'system'
}

function getFontFamily(value: unknown): FontFamilyPreference {
  return STORYBOOK_FONTS.find((preference) => preference === value) ?? 'system'
}

function getFontAntialiasing(value: unknown): StorybookFontAntialiasing {
  return STORYBOOK_FONT_ANTIALIASING.find((preference) => preference === value) ?? 'thin'
}

export default preview
