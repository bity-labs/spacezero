import { applyStorybookAppearance } from './appearance'

afterEach(() => {
  document.documentElement.className = ''
  document.documentElement.style.colorScheme = ''
})

describe('applyStorybookAppearance', () => {
  it('applies dark high contrast and the selected font to the story document', () => {
    applyStorybookAppearance(document.documentElement, 'dark-high-contrast', 'menlo')

    expect(document.documentElement).toHaveClass(
      'dark',
      'dark-high-contrast',
      'font-family-menlo',
      'font-smoothing-antialiased'
    )
    expect(document.documentElement.style.colorScheme).toBe('dark')
  })

  it('removes prior theme and font classes when toolbar values change', () => {
    applyStorybookAppearance(document.documentElement, 'dark-high-contrast', 'menlo')
    applyStorybookAppearance(document.documentElement, 'light', 'geist')

    expect(document.documentElement).not.toHaveClass(
      'dark',
      'dark-high-contrast',
      'font-family-menlo'
    )
    expect(document.documentElement).toHaveClass('font-family-geist', 'font-smoothing-antialiased')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })
})
