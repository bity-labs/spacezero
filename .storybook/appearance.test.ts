import { applyStorybookAppearance } from './appearance'

afterEach(() => {
  document.documentElement.className = ''
  document.documentElement.style.colorScheme = ''
  document.body.style.backgroundColor = ''
  document.body.style.color = ''
})

describe('applyStorybookAppearance', () => {
  it('resolves system theme and applies the selected font to the story document', () => {
    applyStorybookAppearance({
      root: document.documentElement,
      body: document.body,
      themePreference: 'system',
      fontFamily: 'menlo',
      fontAntialiasing: 'thin',
      prefersDark: true
    })

    expect(document.documentElement).toHaveClass(
      'dark',
      'font-family-menlo',
      'font-smoothing-antialiased'
    )
    expect(document.documentElement).not.toHaveClass('dark-high-contrast')
    expect(document.documentElement.style.colorScheme).toBe('dark')
    expect(document.body.style.backgroundColor).toBe('var(--background)')
    expect(document.body.style.color).toBe('var(--foreground)')
  })

  it('removes prior theme and font classes when toolbar values change', () => {
    applyStorybookAppearance({
      root: document.documentElement,
      body: document.body,
      themePreference: 'dark-high-contrast',
      fontFamily: 'menlo',
      fontAntialiasing: 'thin',
      prefersDark: false
    })
    applyStorybookAppearance({
      root: document.documentElement,
      body: document.body,
      themePreference: 'light',
      fontFamily: 'geist',
      fontAntialiasing: 'native',
      prefersDark: false
    })

    expect(document.documentElement).not.toHaveClass(
      'dark',
      'dark-high-contrast',
      'font-family-menlo',
      'font-smoothing-antialiased'
    )
    expect(document.documentElement).toHaveClass('font-family-geist', 'font-smoothing-native')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })
})
