import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppearanceProvider, useAppearance } from './appearance-provider'

afterEach(() => {
  document.documentElement.classList.remove(
    'dark',
    'dark-high-contrast',
    'font-family-geist',
    'font-smoothing-native'
  )
})

describe('AppearanceProvider', () => {
  it('applies loaded appearance settings and updates theme through the cohesive API', async () => {
    vi.spyOn(window.spacezero.settings, 'getAppearanceSettings').mockResolvedValue({
      themePreference: 'dark-high-contrast',
      resolvedTheme: 'dark-high-contrast',
      fontFamily: 'geist',
      thinFontAntialiasing: false
    })
    const updateAppearanceSettings = vi
      .spyOn(window.spacezero.settings, 'updateAppearanceSettings')
      .mockResolvedValue({
        themePreference: 'light',
        resolvedTheme: 'light',
        fontFamily: 'geist',
        thinFontAntialiasing: false
      })

    render(
      <AppearanceProvider>
        <AppearanceConsumer />
      </AppearanceProvider>
    )

    await waitFor(() => {
      expect(screen.getByText('dark-high-contrast')).toBeInTheDocument()
      expect(document.documentElement).toHaveClass(
        'dark',
        'dark-high-contrast',
        'font-family-geist'
      )
      expect(document.documentElement).toHaveClass('font-smoothing-native')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Use light theme' }))

    await waitFor(() => {
      expect(updateAppearanceSettings).toHaveBeenCalledWith({ themePreference: 'light' })
      expect(screen.getByText('light')).toBeInTheDocument()
      expect(document.documentElement).not.toHaveClass('dark')
    })
  })
})

function AppearanceConsumer(): React.JSX.Element {
  const { resolvedTheme, updateAppearanceSettings } = useAppearance()

  return (
    <>
      <span>{resolvedTheme}</span>
      <button
        type="button"
        onClick={() => void updateAppearanceSettings({ themePreference: 'light' })}
      >
        Use light theme
      </button>
    </>
  )
}
